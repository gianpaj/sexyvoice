import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { loadScriptEnv } from './lib/env.mts';
import {
  analyzeInventory,
  buildAllowedLocations,
  type BucketSummary,
  type CleanupConfig,
  type CleanupR2Client,
  createManifest,
  deleteCandidatesInBatches,
  downloadWithoutOverwrite,
  fetchAllStorageKeys,
  filterAllowedInventoryObjects,
  type InventorySummaryEntry,
  listAllObjects,
  MINIMUM_AGE_DAYS,
  objectIdentity,
  parseCleanupCliArgs,
  type R2DeleteResponse,
  type R2ObjectMetadata,
  recheckCandidates,
  resolveLocalObjectPath,
  type StorageKeyPageSource,
  selectByDownloadLimit,
  summarizeBuckets,
  validateManifest,
  verifyLocalFile,
} from './lib/r2-orphan-audio-cleanup.mts';
import { createScriptAdminClient } from './lib/supabase.mts';

loadScriptEnv();

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

interface ActionReportEntry extends R2ObjectMetadata {
  backup?: 'downloaded' | 'existing';
  destination?: string;
  reason?: string;
  status: ActionStatus;
}

type ActionStatus =
  | 'changed-in-r2'
  | 'database-check-failure'
  | 'deferred-by-size-cap'
  | 'deleted'
  | 'deletion-failure'
  | 'download-failure'
  | 'local-mismatch'
  | 'missing-from-r2'
  | 'r2-check-failure'
  | 'referenced-by-database'
  | 'unverifiable-checksum'
  | 'verified-download'
  | 'verified-existing-file';

interface ScriptStorageKeySource extends StorageKeyPageSource {
  hasStorageKey: (key: string) => Promise<boolean>;
}

interface ActionReport {
  createdAt: string;
  manifest: string;
  requested: {
    delete: boolean;
    download: boolean;
    force: boolean;
    maxDownloadBytes?: number;
  };
  results: ActionReportEntry[];
  schemaVersion: 1;
  summary: Array<{
    bucket: string;
    bytes: number;
    count: number;
    prefix: string;
    status: ActionStatus;
  }>;
}

function printHelp(): void {
  console.log(`Find and clean unreferenced free-user audio in R2.

Inventory:
  pnpm cleanup-orphaned-r2-audio

Download from a reviewed manifest:
  pnpm cleanup-orphaned-r2-audio -- \\
    --manifest scripts/backups/r2-orphan-candidates-<timestamp>.json \\
    --download \\
    --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket \\
    --max-download-size 20GB

Delete verified downloads:
  Add --delete --yes to the download command.

Delete without a backup:
  pnpm cleanup-orphaned-r2-audio -- \\
    --manifest scripts/backups/r2-orphan-candidates-<timestamp>.json \\
    --delete --force --yes

Options:
  --manifest <path>           Reviewed inventory manifest
  --download                  Download selected objects
  --download-dir <path>       Required with --download
  --max-download-size <size>  Transfer cap, such as 20GB or 500MiB
  --delete                    Delete eligible objects
  --force                     Skip backup checks when deleting
  --yes                       Required for deletion
  -h, --help                  Show this help`);
}

function readConfig(): CleanupConfig {
  return {
    apiBucket: requiredEnv('R2_SPEECH_API_BUCKET_NAME'),
    mainBucket: requiredEnv('R2_BUCKET_NAME'),
  };
}

function createR2Client(): CleanupR2Client {
  const client = new S3Client({
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
    endpoint: requiredEnv('R2_ENDPOINT'),
    region: 'auto',
  });

  return {
    async deleteObjects(bucket, keys): Promise<R2DeleteResponse> {
      const response = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: false,
          },
        }),
      );

      return {
        deleted: (response.Deleted ?? [])
          .map((object) => object.Key)
          .filter((key): key is string => Boolean(key)),
        errors: (response.Errors ?? [])
          .filter((error) => Boolean(error.Key))
          .map((error) => ({
            code: error.Code,
            key: error.Key as string,
            message: error.Message,
          })),
      };
    },

    async getObject(bucket, key, expectedEtag) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          IfMatch: `"${expectedEtag}"`,
          Key: key,
        }),
      );
      if (!(response.Body && Symbol.asyncIterator in response.Body)) {
        throw new Error(`R2 returned no streaming body for ${bucket}/${key}`);
      }
      return response.Body as AsyncIterable<Uint8Array>;
    },

    async headObject(bucket, key) {
      try {
        const response = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          etag: response.ETag,
          lastModified: response.LastModified,
          size: response.ContentLength,
        };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },

    async listObjects(bucket, prefix, continuationToken) {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          Prefix: prefix,
        }),
      );
      return {
        nextContinuationToken: response.NextContinuationToken,
        objects: (response.Contents ?? []).map((object) => ({
          etag: object.ETag,
          key: object.Key,
          lastModified: object.LastModified,
          size: object.Size,
        })),
      };
    },
  };
}

function createStorageKeySource(): ScriptStorageKeySource {
  const supabase = createScriptAdminClient();

  return {
    async hasStorageKey(key) {
      const { data, error } = await supabase
        .from('audio_files')
        .select('storage_key')
        .eq('storage_key', key)
        .limit(1);

      if (error) {
        throw new Error(`Failed to check audio file key: ${error.message}`);
      }

      return (data ?? []).length > 0;
    },

    async listStorageKeys(from, to) {
      const { data, error } = await supabase
        .from('audio_files')
        .select('storage_key')
        .order('storage_key', { ascending: true })
        .range(from, to);

      if (error) {
        throw new Error(`Failed to fetch audio file keys: ${error.message}`);
      }

      return (data ?? []).map((row) => row.storage_key);
    },
  };
}

async function runInventory(
  config: CleanupConfig,
  r2: CleanupR2Client,
): Promise<void> {
  const now = new Date();
  const locations = buildAllowedLocations(config);
  const buckets = [...new Set([config.mainBucket, config.apiBucket])];
  const databaseKeysPromise = fetchAllStorageKeys(createStorageKeySource());
  const objectListsPromise = Promise.all(
    buckets.map((bucket) => listAllObjects(r2, { bucket, prefix: '' })),
  );
  const [databaseKeys, objectLists] = await Promise.all([
    databaseKeysPromise,
    objectListsPromise,
  ]);
  const allObjects = objectLists.flat();
  const bucketTotals = summarizeBuckets(allObjects, buckets);
  const allowedObjects = filterAllowedInventoryObjects(allObjects, locations);
  const inventory = analyzeInventory(
    allowedObjects,
    databaseKeys,
    now,
    locations,
  );
  const manifest = createManifest(
    inventory.candidates,
    config,
    now,
    inventory.summary,
    bucketTotals,
  );
  const outputPath = path.join(
    SCRIPT_DIRECTORY,
    'backups',
    `r2-orphan-candidates-${fileTimestamp(now)}.json`,
  );

  await writeJson(outputPath, manifest);
  console.log(`Manifest: ${path.relative(REPOSITORY_ROOT, outputPath)}`);
  printBucketTotals(bucketTotals);
  printInventorySummary(inventory.summary);
}

async function runAction(
  options: ReturnType<typeof parseCleanupCliArgs>,
  config: CleanupConfig,
  r2: CleanupR2Client,
): Promise<void> {
  const manifestPath = await resolveExistingInputPath(
    options.manifest as string,
  );
  const manifest = validateManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
    config,
  );
  const locations = buildAllowedLocations(config);

  if (options.download) {
    for (const candidate of manifest.candidates) {
      resolveLocalObjectPath(
        options.downloadDir as string,
        candidate.bucket,
        candidate.key,
      );
    }
  }

  const results = new Map<string, ActionReportEntry>();
  let databaseKeys: Set<string>;
  try {
    databaseKeys = await fetchAllStorageKeys(createStorageKeySource());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const failedResults = manifest.candidates.map((candidate) => ({
      ...candidate,
      reason,
      status: 'database-check-failure' as const,
    }));
    await writeActionReport(manifestPath, options, failedResults);
    process.exitCode = 1;
    return;
  }

  const initialChecks = await recheckCandidates(
    manifest.candidates,
    databaseKeys,
    r2,
    locations,
    new Date(),
  );
  const eligible: R2ObjectMetadata[] = [];

  for (const check of initialChecks) {
    if (check.status === 'eligible') {
      eligible.push(check.candidate);
      continue;
    }
    results.set(objectIdentity(check.candidate), {
      ...check.candidate,
      reason: check.reason,
      status: check.status,
    });
  }

  const backedUp: R2ObjectMetadata[] = [];
  if (options.download) {
    const missingLocally: R2ObjectMetadata[] = [];

    for (const candidate of eligible) {
      const destination = resolveLocalObjectPath(
        options.downloadDir as string,
        candidate.bucket,
        candidate.key,
      );
      let verification: Awaited<ReturnType<typeof verifyLocalFile>>;
      try {
        verification = await verifyLocalFile(destination, candidate);
      } catch (error) {
        results.set(objectIdentity(candidate), {
          ...candidate,
          destination,
          reason: error instanceof Error ? error.message : String(error),
          status: 'download-failure',
        });
        continue;
      }

      if (verification.status === 'verified') {
        backedUp.push(candidate);
        results.set(objectIdentity(candidate), {
          ...candidate,
          backup: 'existing',
          destination,
          status: 'verified-existing-file',
        });
      } else if (verification.status === 'missing') {
        missingLocally.push(candidate);
      } else {
        results.set(objectIdentity(candidate), {
          ...candidate,
          destination,
          reason: verification.reason,
          status:
            verification.status === 'unverifiable'
              ? 'unverifiable-checksum'
              : 'local-mismatch',
        });
      }
    }

    const selection = selectByDownloadLimit(
      missingLocally,
      options.maxDownloadBytes as number,
    );
    for (const candidate of selection.deferred) {
      results.set(objectIdentity(candidate), {
        ...candidate,
        status: 'deferred-by-size-cap',
      });
    }

    for (const candidate of selection.selected) {
      const download = await downloadWithoutOverwrite(
        r2,
        candidate,
        options.downloadDir as string,
      );
      if (download.status === 'downloaded' || download.status === 'exists') {
        backedUp.push(candidate);
        results.set(objectIdentity(candidate), {
          ...candidate,
          backup: download.status === 'downloaded' ? 'downloaded' : 'existing',
          destination: download.destination,
          status:
            download.status === 'downloaded'
              ? 'verified-download'
              : 'verified-existing-file',
        });
      } else {
        results.set(objectIdentity(candidate), {
          ...candidate,
          destination: download.destination,
          reason: download.reason,
          status:
            download.status === 'unverifiable'
              ? 'unverifiable-checksum'
              : 'download-failure',
        });
      }
    }
  }

  if (options.delete) {
    const requestedDeletes = options.download ? backedUp : eligible;
    const storageKeys = createStorageKeySource();

    for (const candidate of requestedDeletes) {
      const identity = objectIdentity(candidate);
      const previous = results.get(identity);

      if (options.download) {
        const destination = previous?.destination;
        if (!destination) {
          results.set(identity, {
            ...candidate,
            backup: previous?.backup,
            reason: 'Verified backup path is missing from the action state',
            status: 'deletion-failure',
          });
          continue;
        }

        let verification: Awaited<ReturnType<typeof verifyLocalFile>>;
        try {
          verification = await verifyLocalFile(destination, candidate);
        } catch (error) {
          results.set(identity, {
            ...candidate,
            backup: previous?.backup,
            destination,
            reason: error instanceof Error ? error.message : String(error),
            status: 'deletion-failure',
          });
          continue;
        }

        if (verification.status !== 'verified') {
          results.set(identity, {
            ...candidate,
            backup: previous?.backup,
            destination,
            reason: verification.reason,
            status:
              verification.status === 'unverifiable'
                ? 'unverifiable-checksum'
                : 'local-mismatch',
          });
          continue;
        }
      }

      let referenced: boolean;
      try {
        referenced = await storageKeys.hasStorageKey(candidate.key);
      } catch (error) {
        results.set(identity, {
          ...candidate,
          backup: previous?.backup,
          destination: previous?.destination,
          reason: error instanceof Error ? error.message : String(error),
          status: 'deletion-failure',
        });
        continue;
      }

      if (referenced) {
        results.set(identity, {
          ...candidate,
          backup: previous?.backup,
          destination: previous?.destination,
          status: 'referenced-by-database',
        });
        continue;
      }

      const [check] = await recheckCandidates(
        [candidate],
        new Set(),
        r2,
        locations,
        new Date(),
      );
      if (check.status !== 'eligible') {
        results.set(identity, {
          ...candidate,
          backup: previous?.backup,
          destination: previous?.destination,
          reason: check.reason,
          status: check.status,
        });
        continue;
      }

      const [deletion] = await deleteCandidatesInBatches(r2, [candidate], 1);
      results.set(identity, {
        ...candidate,
        backup: previous?.backup,
        destination: previous?.destination,
        reason: deletion.reason,
        status: deletion.status,
      });
    }
  }

  const orderedResults = manifest.candidates.map((candidate) => {
    const result = results.get(objectIdentity(candidate));
    if (!result) {
      throw new Error(
        `No action result was recorded for ${candidate.bucket}/${candidate.key}`,
      );
    }
    return result;
  });
  await writeActionReport(manifestPath, options, orderedResults);
}

async function writeActionReport(
  manifestPath: string,
  options: ReturnType<typeof parseCleanupCliArgs>,
  results: ActionReportEntry[],
): Promise<void> {
  const report = createActionReport(manifestPath, options, results);
  const reportPath = actionReportPath(manifestPath, new Date());
  await writeJson(reportPath, report);

  console.log(`Report: ${path.relative(REPOSITORY_ROOT, reportPath)}`);
  printActionSummary(report);

  const failureStatuses = new Set<ActionStatus>([
    'database-check-failure',
    'deletion-failure',
    'download-failure',
    'local-mismatch',
    'r2-check-failure',
  ]);
  if (results.some((result) => failureStatuses.has(result.status))) {
    process.exitCode = 1;
  }
}

function createActionReport(
  manifestPath: string,
  options: ReturnType<typeof parseCleanupCliArgs>,
  results: ActionReportEntry[],
): ActionReport {
  const groups = new Map<string, ActionReport['summary'][number]>();

  for (const result of results) {
    const id = `${result.bucket}\0${result.prefix}\0${result.status}`;
    const current = groups.get(id) ?? {
      bucket: result.bucket,
      bytes: 0,
      count: 0,
      prefix: result.prefix,
      status: result.status,
    };
    current.bytes += result.size;
    current.count += 1;
    groups.set(id, current);
  }

  return {
    createdAt: new Date().toISOString(),
    manifest: path.relative(REPOSITORY_ROOT, manifestPath),
    requested: {
      delete: options.delete,
      download: options.download,
      force: options.force && !options.download,
      maxDownloadBytes: options.maxDownloadBytes,
    },
    results,
    schemaVersion: 1,
    summary: [...groups.values()].sort(
      (left, right) =>
        left.bucket.localeCompare(right.bucket) ||
        left.prefix.localeCompare(right.prefix) ||
        left.status.localeCompare(right.status),
    ),
  };
}

function actionReportPath(manifestPath: string, now: Date): string {
  const extension = path.extname(manifestPath);
  const base = path.basename(manifestPath, extension);
  return path.join(
    path.dirname(manifestPath),
    `${base}-action-${fileTimestamp(now)}.json`,
  );
}

async function resolveExistingInputPath(input: string): Promise<string> {
  if (path.isAbsolute(input)) {
    await readFile(input);
    return input;
  }

  const candidates = [
    path.resolve(process.cwd(), input),
    path.resolve(REPOSITORY_ROOT, input),
  ];
  for (const candidate of new Set(candidates)) {
    try {
      await readFile(candidate);
      return candidate;
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) {
        throw error;
      }
    }
  }

  throw new Error(`Manifest not found: ${input}`);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

function printBucketTotals(totals: BucketSummary[]): void {
  console.log('Bucket totals');
  for (const total of totals) {
    console.log(`  ${total.bucket}: ${formatTotals(total)}`);
  }
}

function printInventorySummary(summary: InventorySummaryEntry[]): void {
  for (const row of summary) {
    console.log(`${row.bucket}/${row.prefix}`);
    console.log(`  scanned: ${formatTotals(row.scanned)}`);
    console.log(
      `  younger than ${MINIMUM_AGE_DAYS} days: ${formatTotals(row.youngerThanCutoff)}`,
    );
    console.log(
      `  old and referenced by database: ${formatTotals(row.referencedByDatabase)}`,
    );
    console.log(`  orphan candidates: ${formatTotals(row.candidates)}`);
  }

  if (summary.every((row) => row.candidates.count === 0)) {
    console.log('No orphan candidates found.');
  }
}

function formatTotals(totals: { bytes: number; count: number }): string {
  return `${totals.count} objects, ${formatBytes(totals.bytes)}`;
}

function printActionSummary(report: ActionReport): void {
  for (const row of report.summary) {
    console.log(
      `${row.bucket}/${row.prefix} ${row.status}: ${row.count} objects, ${formatBytes(row.bytes)}`,
    );
  }
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = units[0];

  for (const candidate of units) {
    unit = candidate;
    if (value < 1024 || candidate === units.at(-1)) {
      break;
    }
    value /= 1024;
  }

  return `${value.toFixed(value >= 10 || unit === 'B' ? 0 : 1)} ${unit}`;
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env.${name}`);
  }
  return value;
}

function isNotFound(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const metadata = isRecord(error.$metadata) ? error.$metadata : undefined;
  return (
    error.name === 'NotFound' ||
    error.name === 'NoSuchKey' ||
    metadata?.httpStatusCode === 404
  );
}

function isNodeError(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const options = parseCleanupCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const config = readConfig();
  const r2 = createR2Client();

  if (options.manifest) {
    if (options.download && options.force) {
      console.log('--force is ignored because --download is active.');
    }
    await runAction(options, config, r2);
    return;
  }

  await runInventory(config, r2);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
