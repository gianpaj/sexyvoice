import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Redis } from '@upstash/redis';

import { loadScriptEnv } from './lib/env.mts';
import { createR2Client } from './lib/r2-client.mts';
import {
  type AudioUrlCache,
  analyzeInventory,
  type BucketSummary,
  buildAllowedLocations,
  type CleanupCliOptions,
  type CleanupConfig,
  createManifest,
  deleteCandidatesInBatches,
  evictDeletedAudioCache,
  fetchAllStorageKeys,
  filterAllowedInventoryObjects,
  type InventorySummaryEntry,
  MINIMUM_AGE_DAYS,
  objectIdentity,
  parseCleanupCliArgs,
  recheckCandidates,
  type StorageKeyPageSource,
  summarizeBuckets,
  validateManifest,
} from './lib/r2-orphan-audio-cleanup.mts';
import {
  downloadWithoutOverwrite,
  formatBytes,
  listAllObjects,
  type R2Client,
  type R2ObjectMetadata,
  resolveLocalObjectPath,
  selectByDownloadLimit,
  verifyLocalFile,
} from './lib/r2-transfer.mts';
import { createScriptAdminClient } from './lib/supabase.mts';

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

export interface ScriptStorageKeySource extends StorageKeyPageSource {
  hasStorageKey: (key: string) => Promise<boolean>;
}

export interface ActionReport {
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

export interface ActionDependencies {
  audioUrlCache?: AudioUrlCache;
  client: R2Client;
  log?: (message: string) => void;
  now?: () => Date;
  storageKeys: ScriptStorageKeySource;
  writeReport?: (reportPath: string, report: ActionReport) => Promise<void>;
}

export interface ActionRunResult {
  exitCode: 0 | 1;
  report: ActionReport;
  reportPath: string;
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

function createStorageKeySource(): ScriptStorageKeySource {
  const supabase = createScriptAdminClient();

  // audio_files uses soft deletion. Keep every row in these checks so a future
  // status filter cannot turn user-deleted history into cleanup candidates.
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
        .order('id', { ascending: true })
        .range(from, to);

      if (error) {
        throw new Error(`Failed to fetch audio file keys: ${error.message}`);
      }

      return (data ?? []).map((row) => row.storage_key);
    },
  };
}

function createAudioUrlCache(): AudioUrlCache {
  const redis = Redis.fromEnv();
  return {
    async deleteKey(key): Promise<void> {
      await redis.del(key);
    },
  };
}

export async function runInventory(
  config: CleanupConfig,
  r2: R2Client,
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

export async function runAction(
  options: CleanupCliOptions,
  config: CleanupConfig,
  dependencies: ActionDependencies,
): Promise<ActionRunResult> {
  const r2 = dependencies.client;
  const now = dependencies.now ?? (() => new Date());
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
      await resolveLocalObjectPath(
        options.downloadDir as string,
        candidate.bucket,
        candidate.key,
      );
    }
  }

  const results = new Map<string, ActionReportEntry>();
  let databaseKeys: Set<string>;
  try {
    databaseKeys = await fetchAllStorageKeys(dependencies.storageKeys);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const failedResults = manifest.candidates.map((candidate) => ({
      ...candidate,
      reason,
      status: 'database-check-failure' as const,
    }));
    return writeActionReport(
      manifestPath,
      options,
      failedResults,
      dependencies,
    );
  }

  const initialChecks = await recheckCandidates(
    manifest.candidates,
    databaseKeys,
    r2,
    locations,
    now(),
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
      const destination = await resolveLocalObjectPath(
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

      if (verification.status === 'verified-checksum') {
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
            verification.status === 'verified-size'
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
      if (
        download.status === 'downloaded-checksum' ||
        download.status === 'existing-checksum'
      ) {
        backedUp.push(candidate);
        results.set(objectIdentity(candidate), {
          ...candidate,
          backup:
            download.status === 'downloaded-checksum'
              ? 'downloaded'
              : 'existing',
          destination: download.destination,
          status:
            download.status === 'downloaded-checksum'
              ? 'verified-download'
              : 'verified-existing-file',
        });
      } else {
        let status: ActionStatus = 'download-failure';
        if (
          download.status === 'downloaded-size' ||
          download.status === 'existing-size'
        ) {
          status = 'unverifiable-checksum';
        } else if (download.status === 'changed-in-r2') {
          status = 'changed-in-r2';
        } else if (download.status === 'missing-from-r2') {
          status = 'missing-from-r2';
        }
        results.set(objectIdentity(candidate), {
          ...candidate,
          destination: download.destination,
          reason: download.reason,
          status,
        });
      }
    }
  }

  if (options.delete) {
    const requestedDeletes = options.download ? backedUp : eligible;
    const storageKeys = dependencies.storageKeys;
    const audioUrlCache = dependencies.audioUrlCache;
    if (!audioUrlCache) {
      throw new Error('Delete actions require an audio URL cache client');
    }

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

        if (verification.status !== 'verified-checksum') {
          results.set(identity, {
            ...candidate,
            backup: previous?.backup,
            destination,
            reason:
              'reason' in verification
                ? verification.reason
                : 'Local backup is missing',
            status:
              verification.status === 'verified-size'
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
        now(),
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
      if (deletion.status === 'deleted') {
        try {
          await evictDeletedAudioCache(
            candidate,
            config.mainBucket,
            audioUrlCache,
          );
        } catch (error) {
          results.set(identity, {
            ...candidate,
            backup: previous?.backup,
            destination: previous?.destination,
            reason: `R2 object was deleted, but Redis cache eviction failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            status: 'deletion-failure',
          });
          continue;
        }
      }
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
  return writeActionReport(manifestPath, options, orderedResults, dependencies);
}

async function writeActionReport(
  manifestPath: string,
  options: CleanupCliOptions,
  results: ActionReportEntry[],
  dependencies: Pick<ActionDependencies, 'log' | 'now' | 'writeReport'>,
): Promise<ActionRunResult> {
  const createdAt = dependencies.now?.() ?? new Date();
  const report = createActionReport(manifestPath, options, results, createdAt);
  const reportPath = actionReportPath(manifestPath, createdAt);
  await (dependencies.writeReport ?? writeJson)(reportPath, report);

  const log = dependencies.log ?? console.log;
  log(`Report: ${path.relative(REPOSITORY_ROOT, reportPath)}`);
  printActionSummary(report, log);

  const failureStatuses = new Set<ActionStatus>([
    'database-check-failure',
    'deletion-failure',
    'download-failure',
    'local-mismatch',
    'r2-check-failure',
  ]);
  const exitCode = results.some((result) => failureStatuses.has(result.status))
    ? 1
    : 0;
  return { exitCode, report, reportPath };
}

function createActionReport(
  manifestPath: string,
  options: CleanupCliOptions,
  results: ActionReportEntry[],
  createdAt: Date,
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
    createdAt: createdAt.toISOString(),
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

function printActionSummary(
  report: ActionReport,
  log: (message: string) => void,
): void {
  for (const row of report.summary) {
    log(
      `${row.bucket}/${row.prefix} ${row.status}: ${row.count} objects, ${formatBytes(row.bytes)}`,
    );
  }
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

function isNodeError(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function main(): Promise<void> {
  loadScriptEnv();
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
    const result = await runAction(options, config, {
      audioUrlCache: options.delete ? createAudioUrlCache() : undefined,
      client: r2,
      storageKeys: createStorageKeySource(),
    });
    process.exitCode = result.exitCode;
    return;
  }

  await runInventory(config, r2);
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;
if (entryPoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
