import { constants } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Effect, Result } from 'effect';
import { all as progressAll } from 'effective-progress';

import { loadScriptEnv } from './lib/env.mts';
import { createR2Client } from './lib/r2-client.mts';
import {
  assertR2BucketName,
  compareR2ObjectsOldestFirst,
  type DownloadResult,
  downloadWithoutOverwrite,
  formatBytes,
  listAllObjects,
  parseByteSize,
  type R2Client,
  type R2Location,
  type R2ObjectMetadata,
  resolveLocalObjectPath,
  selectByDownloadLimit,
  UnsafeLocalPathError,
  verifyLocalFile,
} from './lib/r2-transfer.mts';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const REPORT_SCHEMA_VERSION = 1;
const DOWNLOAD_CONCURRENCY = 4;

export interface BackupCliOptions {
  downloadDir?: string;
  dryRun: boolean;
  help: boolean;
  maxDownloadBytes?: number;
  source?: string;
}

export type BackupStatus =
  | 'changed-in-r2'
  | 'deferred-by-size-cap'
  | 'download-failure'
  | 'downloaded-checksum'
  | 'downloaded-size'
  | 'existing-checksum'
  | 'existing-size'
  | 'local-mismatch'
  | 'local-read-failure'
  | 'missing-from-r2'
  | 'selected-for-download'
  | 'unsafe-path';

export interface BackupResult extends R2ObjectMetadata {
  destination?: string;
  reason?: string;
  status: BackupStatus;
}

interface ListingFailure extends R2Location {
  reason: string;
}

interface ReportTotals {
  bytes: number;
  count: number;
}

interface SourceStatusSummary extends R2Location, ReportTotals {
  status: BackupStatus;
}

interface BucketStatusSummary extends ReportTotals {
  bucket: string;
  status: BackupStatus;
}

interface StatusSummary extends ReportTotals {
  status: BackupStatus;
}

export interface BackupReport {
  createdAt: string;
  listingFailures: ListingFailure[];
  requested: {
    dryRun: boolean;
    maxDownloadBytes?: number;
    source?: string;
  };
  resolvedSources: R2Location[];
  results: BackupResult[];
  schemaVersion: 1;
  sourceTotals: Array<R2Location & { bytes: number; count: number }>;
  summary: {
    byBucket: BucketStatusSummary[];
    bySource: SourceStatusSummary[];
    byStatus: StatusSummary[];
  };
}

interface BackupDependencies {
  client: R2Client;
  interactive?: boolean;
  log?: (message: string) => void;
  now?: () => Date;
  reportDirectory?: string;
  runDownloads?: DownloadRunner;
}

type DownloadFunction = (
  object: R2ObjectMetadata,
  signal?: AbortSignal,
) => Promise<DownloadResult>;

type DownloadRunner = (
  objects: R2ObjectMetadata[],
  download: DownloadFunction,
  selectedBytes: number,
  interactive: boolean,
) => Promise<DownloadResult[]>;

class DownloadOutcomeError extends Error {
  readonly outcome: DownloadResult;

  constructor(outcome: DownloadResult) {
    super(outcome.reason ?? outcome.status);
    this.name = 'DownloadOutcomeError';
    this.outcome = outcome;
  }
}

export function parseBackupCliArgs(args: string[]): BackupCliOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  const { values } = parseArgs({
    allowPositionals: false,
    args: normalizedArgs,
    options: {
      'download-dir': { type: 'string' },
      'dry-run': { default: false, type: 'boolean' },
      help: { default: false, short: 'h', type: 'boolean' },
      'max-download-size': { type: 'string' },
      source: { type: 'string' },
    },
    strict: true,
  });

  const options: BackupCliOptions = {
    downloadDir: values['download-dir'],
    dryRun: values['dry-run'],
    help: values.help,
    maxDownloadBytes: values['max-download-size']
      ? parseByteSize(values['max-download-size'])
      : undefined,
    source: values.source,
  };

  if (!(options.help || options.downloadDir?.trim())) {
    throw new Error('--download-dir is required');
  }
  return options;
}

export function resolveBackupSources(
  source: string | undefined,
  environment: NodeJS.ProcessEnv,
): R2Location[] {
  const rawSources =
    source === undefined
      ? [
          requiredEnv(environment, 'R2_BUCKET_NAME'),
          requiredEnv(environment, 'R2_SPEECH_API_BUCKET_NAME'),
        ]
      : source.split(',');

  if (rawSources.some((value) => value.trim().length === 0)) {
    throw new Error('--source contains an empty R2 location');
  }

  const unique = new Map<string, R2Location>();
  for (const rawSource of rawSources) {
    const value = rawSource.trim();
    const separator = value.indexOf('/');
    const location = {
      bucket: separator === -1 ? value : value.slice(0, separator),
      prefix: separator === -1 ? '' : value.slice(separator + 1),
    };
    assertR2BucketName(location.bucket);
    unique.set(sourceIdentity(location), location);
  }

  const locations = [...unique.values()];
  for (let leftIndex = 0; leftIndex < locations.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < locations.length;
      rightIndex += 1
    ) {
      const left = locations[leftIndex];
      const right = locations[rightIndex];
      if (
        left.bucket === right.bucket &&
        (left.prefix.startsWith(right.prefix) ||
          right.prefix.startsWith(left.prefix))
      ) {
        throw new Error(
          `R2 sources overlap: ${displaySource(left)} and ${displaySource(right)}`,
        );
      }
    }
  }

  return locations;
}

export async function runBackup(
  options: BackupCliOptions,
  sources: R2Location[],
  dependencies: BackupDependencies,
): Promise<{ exitCode: number; report: BackupReport; reportPath: string }> {
  if (!options.downloadDir) {
    throw new Error('--download-dir is required');
  }

  if (!options.dryRun) {
    await mkdir(options.downloadDir, { recursive: true });
    await access(options.downloadDir, constants.W_OK);
    await access(options.downloadDir, constants.X_OK);
  }

  const startedAt = dependencies.now?.() ?? new Date();
  const startedMilliseconds = startedAt.getTime();
  const log = dependencies.log ?? console.log;
  const reportDirectory =
    dependencies.reportDirectory ?? path.join(SCRIPT_DIRECTORY, 'backups');
  const reportPath = path.join(
    reportDirectory,
    `r2-audio-backup-${fileTimestamp(startedAt)}.json`,
  );

  const listings = await Promise.allSettled(
    sources.map((source) => listAllObjects(dependencies.client, source)),
  );
  const listingFailures: ListingFailure[] = [];
  const objectsBySource = new Map<string, R2ObjectMetadata[]>();

  for (const [index, listing] of listings.entries()) {
    const source = sources[index];
    if (listing.status === 'rejected') {
      listingFailures.push({
        ...source,
        reason: errorMessage(listing.reason),
      });
    } else {
      objectsBySource.set(sourceIdentity(source), listing.value);
    }
  }

  if (listingFailures.length > 0) {
    const report = createBackupReport({
      createdAt: startedAt,
      listingFailures,
      objectsBySource,
      options,
      results: [],
      sources,
    });
    await writeJson(reportPath, report);
    for (const failure of listingFailures) {
      log(`Listing failed for ${displaySource(failure)}: ${failure.reason}`);
    }
    log(`Report: ${displayReportPath(reportPath)}`);
    return { exitCode: 1, report, reportPath };
  }

  const objects = [...objectsBySource.values()]
    .flat()
    .sort(compareR2ObjectsOldestFirst);
  const results = new Map<string, BackupResult>();
  const missing: R2ObjectMetadata[] = [];

  for (const object of objects) {
    let destination: string;
    try {
      destination = await resolveLocalObjectPath(
        options.downloadDir,
        object.bucket,
        object.key,
      );
    } catch (error) {
      results.set(objectIdentity(object), {
        ...object,
        reason: errorMessage(error),
        status:
          error instanceof UnsafeLocalPathError
            ? 'unsafe-path'
            : 'local-read-failure',
      });
      continue;
    }

    const relativeDestination = path.relative(options.downloadDir, destination);
    try {
      const verification = await verifyLocalFile(destination, object);
      if (verification.status === 'missing') {
        missing.push(object);
        continue;
      }
      if (verification.status === 'verified-checksum') {
        results.set(objectIdentity(object), {
          ...object,
          destination: relativeDestination,
          status: 'existing-checksum',
        });
        continue;
      }
      if (verification.status === 'verified-size') {
        results.set(objectIdentity(object), {
          ...object,
          destination: relativeDestination,
          reason: verification.reason,
          status: 'existing-size',
        });
        continue;
      }
      results.set(objectIdentity(object), {
        ...object,
        destination: relativeDestination,
        reason: verification.reason,
        status: 'local-mismatch',
      });
    } catch (error) {
      results.set(objectIdentity(object), {
        ...object,
        destination: relativeDestination,
        reason: errorMessage(error),
        status: 'local-read-failure',
      });
    }
  }

  const selection =
    options.maxDownloadBytes === undefined
      ? {
          deferred: [],
          selected: missing,
          transferBytes: totalBytes(missing),
        }
      : selectByDownloadLimit(missing, options.maxDownloadBytes);

  for (const object of selection.deferred) {
    results.set(objectIdentity(object), {
      ...object,
      destination: relativeObjectPath(object),
      status: 'deferred-by-size-cap',
    });
  }

  printSourceTotals(log, sources, objectsBySource);
  printPlan(log, objects, results, missing, selection);

  if (options.dryRun) {
    for (const object of selection.selected) {
      results.set(objectIdentity(object), {
        ...object,
        destination: relativeObjectPath(object),
        status: 'selected-for-download',
      });
    }
  } else if (selection.selected.length > 0) {
    const runDownloads = dependencies.runDownloads ?? runDownloadEffects;
    const downloads = await runDownloads(
      selection.selected,
      async (object, signal) => {
        try {
          return await downloadWithoutOverwrite(
            dependencies.client,
            object,
            options.downloadDir as string,
            signal,
          );
        } catch (error) {
          return {
            destination: '',
            reason: errorMessage(error),
            status: 'download-failure',
          };
        }
      },
      selection.transferBytes,
      dependencies.interactive ?? process.stdout.isTTY === true,
    );

    if (downloads.length !== selection.selected.length) {
      throw new Error('Download runner returned an incomplete result set');
    }
    for (const [index, download] of downloads.entries()) {
      const object = selection.selected[index];
      results.set(objectIdentity(object), {
        ...object,
        destination: relativeObjectPath(object),
        reason: download.reason,
        status: download.status,
      });
    }
  }

  const orderedResults = objects.map((object) => {
    const result = results.get(objectIdentity(object));
    if (!result) {
      throw new Error(
        `No backup result was recorded for ${object.bucket}/${object.key}`,
      );
    }
    return result;
  });
  const completedAt = dependencies.now?.() ?? new Date();
  const report = createBackupReport({
    createdAt: startedAt,
    listingFailures,
    objectsBySource,
    options,
    results: orderedResults,
    sources,
  });
  await writeJson(reportPath, report);
  printFailures(log, orderedResults);
  printCompletion(
    log,
    orderedResults,
    Math.max(0, completedAt.getTime() - startedMilliseconds),
    reportPath,
  );

  return {
    exitCode: hasFailures(orderedResults) ? 1 : 0,
    report,
    reportPath,
  };
}

export async function runDownloadEffects(
  objects: R2ObjectMetadata[],
  download: DownloadFunction,
  selectedBytes: number,
  interactive: boolean,
): Promise<DownloadResult[]> {
  const effects = objects.map((object) =>
    Effect.flatMap(
      Effect.tryPromise({
        catch: (cause) =>
          new DownloadOutcomeError({
            destination: '',
            reason: errorMessage(cause),
            status: 'download-failure',
          }),
        try: (signal) => download(object, signal),
      }),
      (outcome) =>
        isSuccessfulDownload(outcome)
          ? Effect.succeed(outcome)
          : Effect.fail(new DownloadOutcomeError(outcome)),
    ),
  );
  const options = {
    concurrency: DOWNLOAD_CONCURRENCY,
    mode: 'result' as const,
  };
  const program = interactive
    ? progressAll(effects, {
        ...options,
        description: `Downloading R2 objects (${formatBytes(selectedBytes)})`,
      })
    : Effect.all(effects, options);
  const outcomes = await Effect.runPromise(program);

  return outcomes.map((outcome) =>
    Result.isSuccess(outcome) ? outcome.success : outcome.failure.outcome,
  );
}

function createBackupReport({
  createdAt,
  listingFailures,
  objectsBySource,
  options,
  results,
  sources,
}: {
  createdAt: Date;
  listingFailures: ListingFailure[];
  objectsBySource: Map<string, R2ObjectMetadata[]>;
  options: BackupCliOptions;
  results: BackupResult[];
  sources: R2Location[];
}): BackupReport {
  const bySource = new Map<string, SourceStatusSummary>();
  const byBucket = new Map<string, BucketStatusSummary>();
  const byStatus = new Map<BackupStatus, StatusSummary>();
  for (const result of results) {
    const sourceKey = `${sourceIdentity(result)}\0${result.status}`;
    const sourceTotal = bySource.get(sourceKey) ?? {
      bucket: result.bucket,
      bytes: 0,
      count: 0,
      prefix: result.prefix,
      status: result.status,
    };
    sourceTotal.bytes += result.size;
    sourceTotal.count += 1;
    bySource.set(sourceKey, sourceTotal);

    const bucketKey = `${result.bucket}\0${result.status}`;
    const bucketTotal = byBucket.get(bucketKey) ?? {
      bucket: result.bucket,
      bytes: 0,
      count: 0,
      status: result.status,
    };
    bucketTotal.bytes += result.size;
    bucketTotal.count += 1;
    byBucket.set(bucketKey, bucketTotal);

    const statusTotal = byStatus.get(result.status) ?? {
      bytes: 0,
      count: 0,
      status: result.status,
    };
    statusTotal.bytes += result.size;
    statusTotal.count += 1;
    byStatus.set(result.status, statusTotal);
  }

  return {
    createdAt: createdAt.toISOString(),
    listingFailures,
    requested: {
      dryRun: options.dryRun,
      maxDownloadBytes: options.maxDownloadBytes,
      source: options.source,
    },
    resolvedSources: sources,
    results,
    schemaVersion: REPORT_SCHEMA_VERSION,
    sourceTotals: sources.map((source) => {
      const objects = objectsBySource.get(sourceIdentity(source)) ?? [];
      return {
        ...source,
        bytes: totalBytes(objects),
        count: objects.length,
      };
    }),
    summary: {
      byBucket: [...byBucket.values()].sort(
        (left, right) =>
          left.bucket.localeCompare(right.bucket) ||
          left.status.localeCompare(right.status),
      ),
      bySource: [...bySource.values()].sort(
        (left, right) =>
          left.bucket.localeCompare(right.bucket) ||
          left.prefix.localeCompare(right.prefix) ||
          left.status.localeCompare(right.status),
      ),
      byStatus: [...byStatus.values()].sort((left, right) =>
        left.status.localeCompare(right.status),
      ),
    },
  };
}

function printSourceTotals(
  log: (message: string) => void,
  sources: R2Location[],
  objectsBySource: Map<string, R2ObjectMetadata[]>,
): void {
  log('Source totals');
  for (const source of sources) {
    const objects = objectsBySource.get(sourceIdentity(source)) ?? [];
    log(
      `  ${displaySource(source)}: ${objects.length} objects, ${formatBytes(totalBytes(objects))}`,
    );
  }
}

function printPlan(
  log: (message: string) => void,
  objects: R2ObjectMetadata[],
  results: Map<string, BackupResult>,
  missing: R2ObjectMetadata[],
  selection: {
    deferred: R2ObjectMetadata[];
    selected: R2ObjectMetadata[];
    transferBytes: number;
  },
): void {
  const existing = objects.filter((object) => {
    const status = results.get(objectIdentity(object))?.status;
    return status === 'existing-checksum' || status === 'existing-size';
  });
  log('Transfer plan');
  log(`  existing: ${formatObjectTotals(existing)}`);
  log(`  missing: ${formatObjectTotals(missing)}`);
  log(`  deferred: ${formatObjectTotals(selection.deferred)}`);
  log(`  selected: ${formatObjectTotals(selection.selected)}`);
}

function printFailures(
  log: (message: string) => void,
  results: BackupResult[],
): void {
  for (const result of results.filter((entry) =>
    isFailureStatus(entry.status),
  )) {
    log(
      `Failed ${result.bucket}/${result.key} [${result.status}]: ${result.reason ?? 'No reason returned'}`,
    );
  }
}

function printCompletion(
  log: (message: string) => void,
  results: BackupResult[],
  elapsedMilliseconds: number,
  reportPath: string,
): void {
  const downloaded = results.filter((result) =>
    result.status.startsWith('downloaded-'),
  );
  const checksumVerified = results.filter(
    (result) =>
      result.status === 'downloaded-checksum' ||
      result.status === 'existing-checksum',
  );
  const sizeVerified = results.filter(
    (result) =>
      result.status === 'downloaded-size' || result.status === 'existing-size',
  );
  const failed = results.filter((result) => isFailureStatus(result.status));
  const downloadedBytes = totalBytes(downloaded);
  const seconds = elapsedMilliseconds / 1000;
  const averageBytesPerSecond = seconds > 0 ? downloadedBytes / seconds : 0;

  log('Backup complete');
  log(`  downloaded: ${formatObjectTotals(downloaded)}`);
  log(`  checksum verified: ${formatObjectTotals(checksumVerified)}`);
  log(`  size verified: ${formatObjectTotals(sizeVerified)}`);
  log(`  failed: ${formatObjectTotals(failed)}`);
  log(`  elapsed: ${formatDuration(elapsedMilliseconds)}`);
  log(`  average rate: ${formatBytes(averageBytesPerSecond)}/s`);
  log(`Report: ${displayReportPath(reportPath)}`);
}

function hasFailures(results: BackupResult[]): boolean {
  return results.some((result) => isFailureStatus(result.status));
}

function isFailureStatus(status: BackupStatus): boolean {
  return (
    status === 'changed-in-r2' ||
    status === 'download-failure' ||
    status === 'local-mismatch' ||
    status === 'local-read-failure' ||
    status === 'missing-from-r2' ||
    status === 'unsafe-path'
  );
}

function isSuccessfulDownload(result: DownloadResult): boolean {
  return (
    result.status === 'downloaded-checksum' ||
    result.status === 'downloaded-size' ||
    result.status === 'existing-checksum' ||
    result.status === 'existing-size'
  );
}

function relativeObjectPath(object: R2ObjectMetadata): string {
  return path.join(object.bucket, object.key);
}

function formatObjectTotals(objects: Array<{ size: number }>): string {
  return `${objects.length} objects, ${formatBytes(totalBytes(objects))}`;
}

function totalBytes(objects: Array<{ size: number }>): number {
  return objects.reduce((sum, object) => sum + object.size, 0);
}

function formatDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function sourceIdentity(source: R2Location): string {
  return `${source.bucket}\0${source.prefix}`;
}

function objectIdentity(
  object: Pick<R2ObjectMetadata, 'bucket' | 'key'>,
): string {
  return `${object.bucket}\0${object.key}`;
}

function displaySource(source: R2Location): string {
  return source.prefix ? `${source.bucket}/${source.prefix}` : source.bucket;
}

function displayReportPath(reportPath: string): string {
  const relative = path.relative(REPOSITORY_ROOT, reportPath);
  return relative.startsWith('..') ? reportPath : relative;
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requiredEnv(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing env.${name}`);
  }
  return value;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

function printHelp(): void {
  console.log(`Back up R2 audio to a local directory without overwriting files.

Usage:
  pnpm backup-r2-audio -- --download-dir <path> [options]

Options:
  --download-dir <path>       Required local backup directory
  --source <locations>        Comma-separated bucket or bucket/prefix sources
  --max-download-size <size>  Transfer cap, such as 20GB or 500MiB
  --dry-run                   Scan and compare without downloading
  -h, --help                  Show this help`);
}

async function main(): Promise<void> {
  loadScriptEnv();
  const options = parseBackupCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sources = resolveBackupSources(options.source, process.env);
  const result = await runBackup(options, sources, {
    client: createR2Client(),
  });
  process.exitCode = result.exitCode;
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;
if (entryPoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
