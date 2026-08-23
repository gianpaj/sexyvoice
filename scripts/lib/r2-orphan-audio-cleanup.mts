import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { copyFile, link, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

export const MANIFEST_SCHEMA_VERSION = 1;
export const MINIMUM_AGE_DAYS = 45;
export const DEFAULT_PAGE_SIZE = 1000;
export const DEFAULT_DELETE_BATCH_SIZE = 100;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SIMPLE_ETAG_PATTERN = /^[a-f\d]{32}$/i;
const SIZE_PATTERN = /^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i;

export interface CleanupConfig {
  apiBucket: string;
  mainBucket: string;
}

export interface AllowedLocation {
  bucket: string;
  prefix: string;
}

export interface R2ObjectMetadata {
  bucket: string;
  etag: string;
  key: string;
  lastModified: string;
  prefix: string;
  size: number;
}

export interface ManifestSummaryEntry {
  bucket: string;
  bytes: number;
  count: number;
  prefix: string;
}

export interface ObjectTotals {
  bytes: number;
  count: number;
}

export interface BucketSummary extends ObjectTotals {
  bucket: string;
}

export interface InventorySummaryEntry {
  bucket: string;
  candidates: ObjectTotals;
  prefix: string;
  referencedByDatabase: ObjectTotals;
  scanned: ObjectTotals;
  youngerThanCutoff: ObjectTotals;
}

export interface InventoryAnalysis {
  candidates: R2ObjectMetadata[];
  summary: InventorySummaryEntry[];
}

export interface CleanupManifest {
  bucketNames: {
    api: string;
    main: string;
  };
  bucketTotals?: BucketSummary[];
  candidates: R2ObjectMetadata[];
  createdAt: string;
  cutoff: string;
  inventory?: InventorySummaryEntry[];
  minimumAgeDays: number;
  schemaVersion: number;
  summary: ManifestSummaryEntry[];
}

export interface CleanupCliOptions {
  delete: boolean;
  download: boolean;
  downloadDir?: string;
  force: boolean;
  help: boolean;
  manifest?: string;
  maxDownloadBytes?: number;
  yes: boolean;
}

export interface StorageKeyPageSource {
  listStorageKeys: (from: number, to: number) => Promise<string[]>;
}

export interface R2ListedObject {
  etag?: string;
  key?: string;
  lastModified?: Date;
  size?: number;
}

export interface R2ListPage {
  nextContinuationToken?: string;
  objects: R2ListedObject[];
}

export interface R2HeadObject {
  etag?: string;
  lastModified?: Date;
  size?: number;
}

export interface R2DeleteError {
  code?: string;
  key: string;
  message?: string;
}

export interface R2DeleteResponse {
  deleted: string[];
  errors: R2DeleteError[];
}

export interface CleanupR2Client {
  deleteObjects: (bucket: string, keys: string[]) => Promise<R2DeleteResponse>;
  getObject: (
    bucket: string,
    key: string,
    expectedEtag: string,
  ) => Promise<AsyncIterable<Uint8Array>>;
  headObject: (bucket: string, key: string) => Promise<R2HeadObject | null>;
  listObjects: (
    bucket: string,
    prefix: string,
    continuationToken?: string,
  ) => Promise<R2ListPage>;
}

export type RecheckStatus =
  | 'changed-in-r2'
  | 'eligible'
  | 'missing-from-r2'
  | 'r2-check-failure'
  | 'referenced-by-database';

export interface RecheckResult {
  candidate: R2ObjectMetadata;
  reason?: string;
  status: RecheckStatus;
}

export interface DownloadSelection {
  deferred: R2ObjectMetadata[];
  selected: R2ObjectMetadata[];
  transferBytes: number;
}

export type LocalVerificationStatus =
  | 'missing'
  | 'mismatch'
  | 'unverifiable'
  | 'verified';

export interface LocalVerification {
  reason?: string;
  status: LocalVerificationStatus;
}

export interface DownloadResult {
  destination: string;
  reason?: string;
  status: 'downloaded' | 'exists' | 'failed' | 'unverifiable';
}

export interface DeleteResult {
  candidate: R2ObjectMetadata;
  reason?: string;
  status: 'deleted' | 'deletion-failure';
}

export function buildAllowedLocations({
  apiBucket,
  mainBucket,
}: CleanupConfig): AllowedLocation[] {
  const locations = [
    { bucket: mainBucket, prefix: 'generated-audio-free/' },
    { bucket: mainBucket, prefix: 'cloned-audio-free/' },
    { bucket: apiBucket, prefix: 'generated-audio-free/' },
  ];

  const unique = new Map<string, AllowedLocation>();
  for (const location of locations) {
    assertBucketName(location.bucket);
    unique.set(`${location.bucket}\0${location.prefix}`, location);
  }

  return [...unique.values()];
}

export function parseByteSize(input: string): number {
  const match = SIZE_PATTERN.exec(input.trim());
  if (!match) {
    throw new Error(
      'Size must use KB, MB, GB, TB, KiB, MiB, GiB, or TiB, for example 20GB',
    );
  }

  const value = Number(match[1]);
  if (!(value > 0)) {
    throw new Error('Size must be greater than zero');
  }

  const unit = match[2].toLowerCase();
  const powers: Record<string, number> = {
    gb: 1000 ** 3,
    gib: 1024 ** 3,
    kb: 1000,
    kib: 1024,
    mb: 1000 ** 2,
    mib: 1024 ** 2,
    tb: 1000 ** 4,
    tib: 1024 ** 4,
  };
  const bytes = value * powers[unit];

  if (!Number.isSafeInteger(bytes)) {
    throw new Error('Size must resolve to a whole, safe number of bytes');
  }

  return bytes;
}

export function parseCleanupCliArgs(args: string[]): CleanupCliOptions {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  const { values } = parseArgs({
    allowPositionals: false,
    args: normalizedArgs,
    options: {
      delete: { default: false, type: 'boolean' },
      download: { default: false, type: 'boolean' },
      'download-dir': { type: 'string' },
      force: { default: false, type: 'boolean' },
      help: { default: false, short: 'h', type: 'boolean' },
      manifest: { type: 'string' },
      'max-download-size': { type: 'string' },
      yes: { default: false, type: 'boolean' },
    },
    strict: true,
  });

  const options: CleanupCliOptions = {
    delete: values.delete,
    download: values.download,
    downloadDir: values['download-dir'],
    force: values.force,
    help: values.help,
    manifest: values.manifest,
    maxDownloadBytes: values['max-download-size']
      ? parseByteSize(values['max-download-size'])
      : undefined,
    yes: values.yes,
  };

  validateCleanupCliOptions(options);
  return options;
}

export function validateCleanupCliOptions(options: CleanupCliOptions): void {
  if (options.help) {
    return;
  }

  if (!options.download && options.downloadDir) {
    throw new Error('--download-dir requires --download');
  }
  if (!options.download && options.maxDownloadBytes !== undefined) {
    throw new Error('--max-download-size requires --download');
  }
  if (options.download && !options.manifest) {
    throw new Error('--download requires --manifest');
  }
  if (options.download && !options.downloadDir) {
    throw new Error('--download requires --download-dir');
  }
  if (options.download && options.maxDownloadBytes === undefined) {
    throw new Error('--download requires --max-download-size');
  }
  if (options.delete && !options.manifest) {
    throw new Error('--delete requires --manifest');
  }
  if (options.delete && !(options.download || options.force)) {
    throw new Error('--delete requires --download or --force');
  }
  if (options.delete && !options.yes) {
    throw new Error('--delete requires --yes');
  }
  if (options.force && !options.delete && !options.download) {
    throw new Error('--force requires --delete or --download');
  }
  if (options.yes && !options.delete) {
    throw new Error('--yes requires --delete');
  }
  if (options.manifest && !(options.download || options.delete)) {
    throw new Error('--manifest requires --download or --delete');
  }
}

export function isAtLeastDaysOld(
  lastModified: string | Date,
  now: Date,
  days = MINIMUM_AGE_DAYS,
): boolean {
  const timestamp = new Date(lastModified).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return timestamp <= now.getTime() - days * MILLISECONDS_PER_DAY;
}

export function normalizeEtag(etag: string): string {
  const trimmed = etag.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function simpleEtagMd5(etag: string): string | null {
  const normalized = normalizeEtag(etag);
  return SIMPLE_ETAG_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

export function findAllowedLocation(
  bucket: string,
  key: string,
  locations: AllowedLocation[],
): AllowedLocation | undefined {
  return locations.find(
    (location) => location.bucket === bucket && key.startsWith(location.prefix),
  );
}

export function analyzeInventory(
  objects: R2ObjectMetadata[],
  databaseKeys: ReadonlySet<string>,
  now: Date,
  locations: AllowedLocation[],
): InventoryAnalysis {
  const summaries = new Map<string, InventorySummaryEntry>();
  for (const location of locations) {
    summaries.set(locationIdentity(location), {
      bucket: location.bucket,
      candidates: emptyTotals(),
      prefix: location.prefix,
      referencedByDatabase: emptyTotals(),
      scanned: emptyTotals(),
      youngerThanCutoff: emptyTotals(),
    });
  }

  const candidates: R2ObjectMetadata[] = [];
  for (const object of objects) {
    const summary = summaries.get(locationIdentity(object));
    if (!summary) {
      throw new Error(
        `Object is outside the inventory locations: ${object.bucket}/${object.key}`,
      );
    }

    addObject(summary.scanned, object);
    if (!isAtLeastDaysOld(object.lastModified, now)) {
      addObject(summary.youngerThanCutoff, object);
    } else if (databaseKeys.has(object.key)) {
      addObject(summary.referencedByDatabase, object);
    } else {
      addObject(summary.candidates, object);
      candidates.push(object);
    }
  }

  return {
    candidates: candidates.sort(compareOldestFirst),
    summary: [...summaries.values()].sort(compareLocationSummary),
  };
}

export function findOrphanCandidates(
  objects: R2ObjectMetadata[],
  databaseKeys: ReadonlySet<string>,
  now: Date,
): R2ObjectMetadata[] {
  return objects
    .filter(
      (object) =>
        !databaseKeys.has(object.key) &&
        isAtLeastDaysOld(object.lastModified, now),
    )
    .sort(compareOldestFirst);
}

export function selectByDownloadLimit(
  candidates: R2ObjectMetadata[],
  maxBytes: number,
): DownloadSelection {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('Download limit must be a positive, safe integer');
  }

  const selected: R2ObjectMetadata[] = [];
  const deferred: R2ObjectMetadata[] = [];
  let transferBytes = 0;

  for (const candidate of [...candidates].sort(compareOldestFirst)) {
    if (candidate.size <= maxBytes - transferBytes) {
      selected.push(candidate);
      transferBytes += candidate.size;
    } else {
      deferred.push(candidate);
    }
  }

  return { deferred, selected, transferBytes };
}

export function summarizeObjects(
  objects: R2ObjectMetadata[],
): ManifestSummaryEntry[] {
  const groups = new Map<string, ManifestSummaryEntry>();

  for (const object of objects) {
    const id = `${object.bucket}\0${object.prefix}`;
    const current = groups.get(id) ?? {
      bucket: object.bucket,
      bytes: 0,
      count: 0,
      prefix: object.prefix,
    };
    current.bytes += object.size;
    current.count += 1;
    groups.set(id, current);
  }

  return [...groups.values()].sort(
    (left, right) =>
      left.bucket.localeCompare(right.bucket) ||
      left.prefix.localeCompare(right.prefix),
  );
}

export function summarizeBuckets(
  objects: R2ObjectMetadata[],
  buckets: string[],
): BucketSummary[] {
  const totals = new Map(
    [...new Set(buckets)].map((bucket) => [
      bucket,
      { bucket, bytes: 0, count: 0 },
    ]),
  );

  for (const object of objects) {
    const total = totals.get(object.bucket);
    if (!total) {
      throw new Error(`Object belongs to an unknown bucket: ${object.bucket}`);
    }
    total.bytes += object.size;
    total.count += 1;
  }

  return [...totals.values()].sort((left, right) =>
    left.bucket.localeCompare(right.bucket),
  );
}

export function filterAllowedInventoryObjects(
  objects: R2ObjectMetadata[],
  locations: AllowedLocation[],
): R2ObjectMetadata[] {
  return objects.flatMap((object) => {
    const location = findAllowedLocation(object.bucket, object.key, locations);
    return location ? [{ ...object, prefix: location.prefix }] : [];
  });
}

export function createManifest(
  candidates: R2ObjectMetadata[],
  config: CleanupConfig,
  now: Date,
  inventory?: InventorySummaryEntry[],
  bucketTotals?: BucketSummary[],
): CleanupManifest {
  return {
    bucketNames: {
      api: config.apiBucket,
      main: config.mainBucket,
    },
    ...(bucketTotals ? { bucketTotals } : {}),
    candidates: [...candidates].sort(compareOldestFirst),
    createdAt: now.toISOString(),
    cutoff: new Date(
      now.getTime() - MINIMUM_AGE_DAYS * MILLISECONDS_PER_DAY,
    ).toISOString(),
    ...(inventory ? { inventory } : {}),
    minimumAgeDays: MINIMUM_AGE_DAYS,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    summary: summarizeObjects(candidates),
  };
}

export function validateManifest(
  input: unknown,
  config: CleanupConfig,
): CleanupManifest {
  if (!isRecord(input)) {
    throw new Error('Manifest must be a JSON object');
  }
  if (input.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported manifest schema version: ${input.schemaVersion}`,
    );
  }
  if (input.minimumAgeDays !== MINIMUM_AGE_DAYS) {
    throw new Error(`Manifest minimum age must be ${MINIMUM_AGE_DAYS} days`);
  }
  const createdAt = input.createdAt;
  const cutoff = input.cutoff;
  assertIsoDate(createdAt, 'Manifest createdAt');
  assertIsoDate(cutoff, 'Manifest cutoff');
  const expectedCutoff = new Date(
    new Date(createdAt).getTime() - MINIMUM_AGE_DAYS * MILLISECONDS_PER_DAY,
  ).toISOString();
  if (cutoff !== expectedCutoff) {
    throw new Error('Manifest cutoff does not match its creation time');
  }

  if (!isRecord(input.bucketNames)) {
    throw new Error('Manifest bucketNames must be an object');
  }
  if (
    input.bucketNames.main !== config.mainBucket ||
    input.bucketNames.api !== config.apiBucket
  ) {
    throw new Error(
      'Manifest bucket names do not match the current environment',
    );
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error('Manifest candidates must be an array');
  }
  if (!Array.isArray(input.summary)) {
    throw new Error('Manifest summary must be an array');
  }

  const locations = buildAllowedLocations(config);
  const seen = new Set<string>();
  const candidates = input.candidates.map((candidate, index) => {
    const parsed = parseManifestCandidate(candidate, index);
    const location = findAllowedLocation(parsed.bucket, parsed.key, locations);
    if (!location || location.prefix !== parsed.prefix) {
      throw new Error(
        `Manifest candidate ${index} is outside the bucket and prefix allowlist`,
      );
    }

    if (new Date(parsed.lastModified).getTime() > new Date(cutoff).getTime()) {
      throw new Error(
        `Manifest candidate ${index} is newer than the manifest cutoff`,
      );
    }

    const identity = objectIdentity(parsed);
    if (seen.has(identity)) {
      throw new Error(
        `Manifest contains duplicate object ${parsed.bucket}/${parsed.key}`,
      );
    }
    seen.add(identity);
    return parsed;
  });

  const expectedSummary = summarizeObjects(candidates);
  if (JSON.stringify(input.summary) !== JSON.stringify(expectedSummary)) {
    throw new Error('Manifest summary does not match its candidates');
  }
  const inventory =
    input.inventory === undefined
      ? undefined
      : validateInventorySummary(input.inventory, locations, expectedSummary);
  const bucketTotals =
    input.bucketTotals === undefined
      ? undefined
      : validateBucketTotals(input.bucketTotals, config, inventory);

  return {
    bucketNames: {
      api: config.apiBucket,
      main: config.mainBucket,
    },
    ...(bucketTotals ? { bucketTotals } : {}),
    candidates,
    createdAt,
    cutoff,
    ...(inventory ? { inventory } : {}),
    minimumAgeDays: MINIMUM_AGE_DAYS,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    summary: expectedSummary,
  };
}

export async function fetchAllStorageKeys(
  source: StorageKeyPageSource,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Set<string>> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error('Page size must be a positive, safe integer');
  }

  const keys = new Set<string>();
  let offset = 0;

  while (true) {
    const page = await source.listStorageKeys(offset, offset + pageSize - 1);
    for (const key of page) {
      keys.add(key);
    }
    if (page.length < pageSize) {
      break;
    }
    offset += page.length;
  }

  return keys;
}

export async function listAllObjects(
  client: CleanupR2Client,
  location: AllowedLocation,
): Promise<R2ObjectMetadata[]> {
  const objects: R2ObjectMetadata[] = [];
  const seenTokens = new Set<string>();
  let continuationToken: string | undefined;

  while (true) {
    const page = await client.listObjects(
      location.bucket,
      location.prefix,
      continuationToken,
    );

    for (const object of page.objects) {
      if (
        !object.key ||
        object.size === undefined ||
        !object.lastModified ||
        !object.etag
      ) {
        throw new Error(
          `R2 returned incomplete metadata under ${location.bucket}/${location.prefix}`,
        );
      }
      if (!object.key.startsWith(location.prefix)) {
        throw new Error(
          `R2 returned an object outside requested prefix ${location.prefix}`,
        );
      }

      objects.push({
        bucket: location.bucket,
        etag: normalizeEtag(object.etag),
        key: object.key,
        lastModified: object.lastModified.toISOString(),
        prefix: location.prefix,
        size: object.size,
      });
    }

    const nextToken = page.nextContinuationToken;
    if (!nextToken) {
      break;
    }
    if (seenTokens.has(nextToken)) {
      throw new Error('R2 pagination returned a repeated continuation token');
    }
    seenTokens.add(nextToken);
    continuationToken = nextToken;
  }

  return objects;
}

export async function recheckCandidates(
  candidates: R2ObjectMetadata[],
  databaseKeys: ReadonlySet<string>,
  client: CleanupR2Client,
  locations: AllowedLocation[],
  now: Date,
): Promise<RecheckResult[]> {
  const results: RecheckResult[] = [];

  for (const candidate of candidates) {
    const location = findAllowedLocation(
      candidate.bucket,
      candidate.key,
      locations,
    );
    if (!location || location.prefix !== candidate.prefix) {
      throw new Error(
        `Object is outside the bucket and prefix allowlist: ${candidate.bucket}/${candidate.key}`,
      );
    }

    if (databaseKeys.has(candidate.key)) {
      results.push({ candidate, status: 'referenced-by-database' });
      continue;
    }

    let current: R2HeadObject | null;
    try {
      current = await client.headObject(candidate.bucket, candidate.key);
    } catch (error) {
      results.push({
        candidate,
        reason: error instanceof Error ? error.message : String(error),
        status: 'r2-check-failure',
      });
      continue;
    }
    if (!current) {
      results.push({ candidate, status: 'missing-from-r2' });
      continue;
    }

    const reason = metadataMismatchReason(candidate, current, now);
    if (reason) {
      results.push({ candidate, reason, status: 'changed-in-r2' });
      continue;
    }

    results.push({ candidate, status: 'eligible' });
  }

  return results;
}

export function resolveLocalObjectPath(
  downloadDir: string,
  bucket: string,
  key: string,
): string {
  assertBucketName(bucket);
  if (
    !key ||
    path.isAbsolute(key) ||
    key.split(/[\\/]/).some((segment) => segment === '..')
  ) {
    throw new Error(`Unsafe R2 key: ${key}`);
  }

  const bucketDirectory = path.resolve(downloadDir, bucket);
  const destination = path.resolve(bucketDirectory, key);
  const relative = path.relative(bucketDirectory, destination);

  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Unsafe R2 key: ${key}`);
  }
  if (path.isAbsolute(relative)) {
    throw new Error(`Unsafe R2 key: ${key}`);
  }

  return destination;
}

export async function verifyLocalFile(
  filePath: string,
  candidate: R2ObjectMetadata,
): Promise<LocalVerification> {
  let fileStats: Awaited<ReturnType<typeof stat>>;
  try {
    fileStats = await stat(filePath);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return { status: 'missing' };
    }
    throw error;
  }

  if (!fileStats.isFile()) {
    return { reason: 'Local path is not a regular file', status: 'mismatch' };
  }
  if (fileStats.size !== candidate.size) {
    return {
      reason: `Local size ${fileStats.size} does not match R2 size ${candidate.size}`,
      status: 'mismatch',
    };
  }

  const expectedMd5 = simpleEtagMd5(candidate.etag);
  if (!expectedMd5) {
    return {
      reason: 'R2 ETag is not a simple MD5 checksum',
      status: 'unverifiable',
    };
  }

  const actualMd5 = await md5File(filePath);
  if (actualMd5 !== expectedMd5) {
    return {
      reason: `Local MD5 ${actualMd5} does not match R2 ETag ${expectedMd5}`,
      status: 'mismatch',
    };
  }

  return { status: 'verified' };
}

export async function downloadWithoutOverwrite(
  client: CleanupR2Client,
  candidate: R2ObjectMetadata,
  downloadDir: string,
): Promise<DownloadResult> {
  const destination = resolveLocalObjectPath(
    downloadDir,
    candidate.bucket,
    candidate.key,
  );
  let temporaryPath: string | undefined;

  try {
    const existing = await verifyLocalFile(destination, candidate);
    if (existing.status !== 'missing') {
      let status: DownloadResult['status'] = 'failed';
      if (existing.status === 'verified') {
        status = 'exists';
      } else if (existing.status === 'unverifiable') {
        status = 'unverifiable';
      }
      return {
        destination,
        reason: existing.reason,
        status,
      };
    }

    await mkdir(path.dirname(destination), { recursive: true });
    temporaryPath = `${destination}.partial-${randomUUID()}`;
    const body = await client.getObject(
      candidate.bucket,
      candidate.key,
      candidate.etag,
    );
    await pipeline(
      Readable.from(body),
      createByteLimitTransform(candidate.size),
      createWriteStream(temporaryPath, { flags: 'wx' }),
    );

    const verification = await verifyLocalFile(temporaryPath, candidate);
    if (
      verification.status === 'missing' ||
      verification.status === 'mismatch'
    ) {
      return {
        destination,
        reason: verification.reason,
        status: 'failed',
      };
    }

    await finalizeWithoutOverwrite(temporaryPath, destination);
    if (verification.status === 'unverifiable') {
      return {
        destination,
        reason: verification.reason,
        status: 'unverifiable',
      };
    }
    return { destination, status: 'downloaded' };
  } catch (error) {
    return {
      destination,
      reason: error instanceof Error ? error.message : String(error),
      status: 'failed',
    };
  } finally {
    if (temporaryPath) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

export async function deleteCandidatesInBatches(
  client: CleanupR2Client,
  candidates: R2ObjectMetadata[],
  batchSize = DEFAULT_DELETE_BATCH_SIZE,
): Promise<DeleteResult[]> {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0 || batchSize > 1000) {
    throw new Error('Delete batch size must be between 1 and 1000');
  }

  const results: DeleteResult[] = [];
  const byBucket = Map.groupBy(candidates, (candidate) => candidate.bucket);

  for (const [bucket, bucketCandidates] of byBucket) {
    for (let index = 0; index < bucketCandidates.length; index += batchSize) {
      const batch = bucketCandidates.slice(index, index + batchSize);
      let response: R2DeleteResponse;

      try {
        response = await client.deleteObjects(
          bucket,
          batch.map((candidate) => candidate.key),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        results.push(
          ...batch.map((candidate) => ({
            candidate,
            reason,
            status: 'deletion-failure' as const,
          })),
        );
        continue;
      }

      const deleted = new Set(response.deleted);
      const errors = new Map(
        response.errors.map((error) => [error.key, error]),
      );

      for (const candidate of batch) {
        if (deleted.has(candidate.key)) {
          results.push({ candidate, status: 'deleted' });
          continue;
        }

        const error = errors.get(candidate.key);
        results.push({
          candidate,
          reason: error
            ? [error.code, error.message].filter(Boolean).join(': ')
            : 'R2 did not confirm deletion',
          status: 'deletion-failure',
        });
      }
    }
  }

  return results;
}

export function objectIdentity(
  object: Pick<R2ObjectMetadata, 'bucket' | 'key'>,
) {
  return `${object.bucket}\0${object.key}`;
}

function validateBucketTotals(
  input: unknown,
  config: CleanupConfig,
  inventory?: InventorySummaryEntry[],
): BucketSummary[] {
  if (!Array.isArray(input)) {
    throw new Error('Manifest bucketTotals must be an array');
  }

  const expectedBuckets = [...new Set([config.mainBucket, config.apiBucket])];
  const seen = new Set<string>();
  const totals = input.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.bucket !== 'string') {
      throw new Error(`Manifest bucket total ${index} is invalid`);
    }
    if (!expectedBuckets.includes(entry.bucket) || seen.has(entry.bucket)) {
      throw new Error(`Manifest bucket total ${index} has an invalid bucket`);
    }
    seen.add(entry.bucket);
    const total = parseObjectTotals(entry, index, 'bucketTotals');
    return { bucket: entry.bucket, ...total };
  });

  if (seen.size !== expectedBuckets.length) {
    throw new Error(
      'Manifest bucketTotals must include every configured bucket',
    );
  }

  if (inventory) {
    for (const bucket of totals) {
      const scanned = inventory
        .filter((entry) => entry.bucket === bucket.bucket)
        .reduce(
          (sum, entry) => ({
            bytes: sum.bytes + entry.scanned.bytes,
            count: sum.count + entry.scanned.count,
          }),
          emptyTotals(),
        );
      if (scanned.count > bucket.count || scanned.bytes > bucket.bytes) {
        throw new Error(
          `Manifest inventory exceeds bucket total for ${bucket.bucket}`,
        );
      }
    }
  }

  return totals.sort((left, right) => left.bucket.localeCompare(right.bucket));
}

function validateInventorySummary(
  input: unknown,
  locations: AllowedLocation[],
  candidateSummary: ManifestSummaryEntry[],
): InventorySummaryEntry[] {
  if (!Array.isArray(input)) {
    throw new Error('Manifest inventory must be an array');
  }

  const expectedCandidates = new Map(
    candidateSummary.map((entry) => [locationIdentity(entry), entry]),
  );
  const seen = new Set<string>();
  const inventory = input.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Manifest inventory entry ${index} must be an object`);
    }
    if (typeof entry.bucket !== 'string' || typeof entry.prefix !== 'string') {
      throw new Error(
        `Manifest inventory entry ${index} has an invalid location`,
      );
    }

    const location = locations.find(
      (candidate) =>
        candidate.bucket === entry.bucket && candidate.prefix === entry.prefix,
    );
    if (!location) {
      throw new Error(
        `Manifest inventory entry ${index} is outside the location allowlist`,
      );
    }

    const identity = locationIdentity(location);
    if (seen.has(identity)) {
      throw new Error(
        `Manifest inventory repeats ${entry.bucket}/${entry.prefix}`,
      );
    }
    seen.add(identity);

    const scanned = parseObjectTotals(entry.scanned, index, 'scanned');
    const youngerThanCutoff = parseObjectTotals(
      entry.youngerThanCutoff,
      index,
      'youngerThanCutoff',
    );
    const referencedByDatabase = parseObjectTotals(
      entry.referencedByDatabase,
      index,
      'referencedByDatabase',
    );
    const candidates = parseObjectTotals(entry.candidates, index, 'candidates');
    if (
      scanned.count !==
        youngerThanCutoff.count +
          referencedByDatabase.count +
          candidates.count ||
      scanned.bytes !==
        youngerThanCutoff.bytes + referencedByDatabase.bytes + candidates.bytes
    ) {
      throw new Error(`Manifest inventory entry ${index} totals do not add up`);
    }

    const expected = expectedCandidates.get(identity) ?? emptyTotals();
    if (
      candidates.count !== expected.count ||
      candidates.bytes !== expected.bytes
    ) {
      throw new Error(
        `Manifest inventory entry ${index} does not match its candidates`,
      );
    }

    return {
      bucket: location.bucket,
      candidates,
      prefix: location.prefix,
      referencedByDatabase,
      scanned,
      youngerThanCutoff,
    };
  });

  if (seen.size !== locations.length) {
    throw new Error('Manifest inventory must include every allowed location');
  }

  return inventory.sort(compareLocationSummary);
}

function parseObjectTotals(
  input: unknown,
  index: number,
  field: string,
): ObjectTotals {
  if (!isRecord(input)) {
    throw new Error(`Manifest inventory entry ${index} has invalid ${field}`);
  }
  if (
    !Number.isSafeInteger(input.count) ||
    (input.count as number) < 0 ||
    !Number.isSafeInteger(input.bytes) ||
    (input.bytes as number) < 0
  ) {
    throw new Error(`Manifest inventory entry ${index} has invalid ${field}`);
  }
  return { bytes: input.bytes as number, count: input.count as number };
}

function parseManifestCandidate(
  input: unknown,
  index: number,
): R2ObjectMetadata {
  if (!isRecord(input)) {
    throw new Error(`Manifest candidate ${index} must be an object`);
  }

  const stringFields = [
    'bucket',
    'etag',
    'key',
    'lastModified',
    'prefix',
  ] as const;
  for (const field of stringFields) {
    if (typeof input[field] !== 'string' || input[field].length === 0) {
      throw new Error(`Manifest candidate ${index} has invalid ${field}`);
    }
  }
  if (!Number.isSafeInteger(input.size) || (input.size as number) < 0) {
    throw new Error(`Manifest candidate ${index} has invalid size`);
  }
  assertIsoDate(input.lastModified, `Manifest candidate ${index} lastModified`);

  return {
    bucket: input.bucket as string,
    etag: normalizeEtag(input.etag as string),
    key: input.key as string,
    lastModified: input.lastModified as string,
    prefix: input.prefix as string,
    size: input.size as number,
  };
}

function metadataMismatchReason(
  candidate: R2ObjectMetadata,
  current: R2HeadObject,
  now: Date,
): string | undefined {
  if (current.size === undefined || !current.lastModified || !current.etag) {
    return 'R2 HeadObject returned incomplete metadata';
  }
  if (!isAtLeastDaysOld(current.lastModified, now)) {
    return 'Object is younger than the retention cutoff';
  }
  if (current.size !== candidate.size) {
    return `Size changed from ${candidate.size} to ${current.size}`;
  }
  if (normalizeEtag(current.etag) !== normalizeEtag(candidate.etag)) {
    return 'ETag changed';
  }
  if (current.lastModified.toISOString() !== candidate.lastModified) {
    return 'LastModified changed';
  }
  return undefined;
}

function emptyTotals(): ObjectTotals {
  return { bytes: 0, count: 0 };
}

function addObject(totals: ObjectTotals, object: R2ObjectMetadata): void {
  totals.bytes += object.size;
  totals.count += 1;
}

function locationIdentity(
  location: Pick<AllowedLocation, 'bucket' | 'prefix'>,
): string {
  return `${location.bucket}\0${location.prefix}`;
}

function compareLocationSummary(
  left: Pick<AllowedLocation, 'bucket' | 'prefix'>,
  right: Pick<AllowedLocation, 'bucket' | 'prefix'>,
): number {
  return (
    left.bucket.localeCompare(right.bucket) ||
    left.prefix.localeCompare(right.prefix)
  );
}

function compareOldestFirst(
  left: R2ObjectMetadata,
  right: R2ObjectMetadata,
): number {
  return (
    new Date(left.lastModified).getTime() -
      new Date(right.lastModified).getTime() ||
    left.bucket.localeCompare(right.bucket) ||
    left.key.localeCompare(right.key)
  );
}

function assertBucketName(bucket: string): void {
  if (
    !bucket ||
    bucket === '.' ||
    bucket === '..' ||
    bucket.includes('/') ||
    bucket.includes('\\')
  ) {
    throw new Error(`Unsafe R2 bucket name: ${bucket}`);
  }
}

function assertIsoDate(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(new Date(value).getTime()) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function createByteLimitTransform(maxBytes: number): Transform {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        callback(
          new Error(
            `R2 response exceeded the expected size of ${maxBytes} bytes`,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });
}

async function finalizeWithoutOverwrite(
  temporaryPath: string,
  destination: string,
): Promise<void> {
  try {
    await link(temporaryPath, destination);
  } catch (error) {
    const hardLinksUnsupported =
      isNodeError(error, 'EPERM') ||
      isNodeError(error, 'ENOTSUP') ||
      isNodeError(error, 'EOPNOTSUPP');
    if (!hardLinksUnsupported) {
      throw error;
    }
    await copyFile(temporaryPath, destination, constants.COPYFILE_EXCL);
  }
}

async function md5File(filePath: string): Promise<string> {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}
