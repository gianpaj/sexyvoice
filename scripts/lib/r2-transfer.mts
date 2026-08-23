import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { copyFile, link, lstat, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SIMPLE_ETAG_PATTERN = /^[a-f\d]{32}$/i;
const SIZE_PATTERN = /^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i;

export interface R2Location {
  bucket: string;
  prefix: string;
}

export interface R2ObjectMetadata extends R2Location {
  etag: string;
  key: string;
  lastModified: string;
  size: number;
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

export type R2GetObjectResult =
  | { body: AsyncIterable<Uint8Array>; status: 'ok' }
  | { status: 'changed' }
  | { status: 'missing' };

export interface R2Client {
  deleteObjects: (bucket: string, keys: string[]) => Promise<R2DeleteResponse>;
  getObject: (
    bucket: string,
    key: string,
    expectedEtag: string,
    signal?: AbortSignal,
  ) => Promise<R2GetObjectResult>;
  headObject: (bucket: string, key: string) => Promise<R2HeadObject | null>;
  listObjects: (
    bucket: string,
    prefix: string,
    continuationToken?: string,
  ) => Promise<R2ListPage>;
}

export interface DownloadSelection {
  deferred: R2ObjectMetadata[];
  selected: R2ObjectMetadata[];
  transferBytes: number;
}

export type LocalVerification =
  | { status: 'missing' }
  | { reason: string; status: 'mismatch' }
  | { status: 'verified-checksum' }
  | { reason: string; status: 'verified-size' };

export interface DownloadResult {
  destination: string;
  reason?: string;
  status:
    | 'changed-in-r2'
    | 'download-failure'
    | 'downloaded-checksum'
    | 'downloaded-size'
    | 'existing-checksum'
    | 'existing-size'
    | 'missing-from-r2';
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

export function formatBytes(bytes: number): string {
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

export function compareR2ObjectsOldestFirst(
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

  for (const candidate of [...candidates].sort(compareR2ObjectsOldestFirst)) {
    if (candidate.size <= maxBytes - transferBytes) {
      selected.push(candidate);
      transferBytes += candidate.size;
    } else {
      deferred.push(candidate);
    }
  }

  return { deferred, selected, transferBytes };
}

export async function listAllObjects(
  client: Pick<R2Client, 'listObjects'>,
  location: R2Location,
): Promise<R2ObjectMetadata[]> {
  assertBucketName(location.bucket);

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
      if (!Number.isSafeInteger(object.size) || object.size < 0) {
        throw new Error(
          `R2 returned an invalid size under ${location.bucket}/${location.prefix}`,
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

export async function resolveLocalObjectPath(
  downloadDir: string,
  bucket: string,
  key: string,
): Promise<string> {
  assertBucketName(bucket);
  if (
    !key ||
    path.isAbsolute(key) ||
    path.win32.isAbsolute(key) ||
    key.split(/[\\/]/).some((segment) => segment === '..')
  ) {
    throw new Error(`Unsafe R2 key: ${key}`);
  }

  const rootDirectory = path.resolve(downloadDir);
  const bucketDirectory = path.resolve(rootDirectory, bucket);
  const destination = path.resolve(bucketDirectory, key);
  const relative = path.relative(bucketDirectory, destination);

  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Unsafe R2 key: ${key}`);
  }
  if (path.isAbsolute(relative)) {
    throw new Error(`Unsafe R2 key: ${key}`);
  }

  await assertNoSymlinkComponents(rootDirectory, destination);
  return destination;
}

export async function verifyLocalFile(
  filePath: string,
  object: R2ObjectMetadata,
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
  if (fileStats.size !== object.size) {
    return {
      reason: `Local size ${fileStats.size} does not match R2 size ${object.size}`,
      status: 'mismatch',
    };
  }

  const expectedMd5 = simpleEtagMd5(object.etag);
  if (!expectedMd5) {
    return {
      reason: 'R2 ETag is opaque; verified by size only',
      status: 'verified-size',
    };
  }

  const actualMd5 = await md5File(filePath);
  if (actualMd5 !== expectedMd5) {
    return {
      reason: `Local MD5 ${actualMd5} does not match R2 ETag ${expectedMd5}`,
      status: 'mismatch',
    };
  }

  return { status: 'verified-checksum' };
}

export async function downloadWithoutOverwrite(
  client: Pick<R2Client, 'getObject'>,
  object: R2ObjectMetadata,
  downloadDir: string,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  const destination = await resolveLocalObjectPath(
    downloadDir,
    object.bucket,
    object.key,
  );
  let temporaryPath: string | undefined;

  try {
    const existing = await verifyLocalFile(destination, object);
    if (existing.status !== 'missing') {
      if (existing.status === 'verified-checksum') {
        return { destination, status: 'existing-checksum' };
      }
      if (existing.status === 'verified-size') {
        return {
          destination,
          reason: existing.reason,
          status: 'existing-size',
        };
      }
      return {
        destination,
        reason: existing.reason,
        status: 'download-failure',
      };
    }

    await mkdir(path.dirname(destination), { recursive: true });
    await resolveLocalObjectPath(downloadDir, object.bucket, object.key);
    temporaryPath = `${destination}.partial-${randomUUID()}`;

    const response = await client.getObject(
      object.bucket,
      object.key,
      object.etag,
      signal,
    );
    if (response.status === 'changed') {
      return { destination, status: 'changed-in-r2' };
    }
    if (response.status === 'missing') {
      return { destination, status: 'missing-from-r2' };
    }

    await pipeline(
      Readable.from(response.body),
      createByteLimitTransform(object.size),
      createWriteStream(temporaryPath, { flags: 'wx' }),
      ...(signal ? [{ signal }] : []),
    );

    const verification = await verifyLocalFile(temporaryPath, object);
    if (
      verification.status === 'missing' ||
      verification.status === 'mismatch'
    ) {
      return {
        destination,
        reason:
          'reason' in verification
            ? verification.reason
            : 'Downloaded file is missing',
        status: 'download-failure',
      };
    }

    await resolveLocalObjectPath(downloadDir, object.bucket, object.key);
    await finalizeWithoutOverwrite(temporaryPath, destination);
    if (verification.status === 'verified-size') {
      return {
        destination,
        reason: verification.reason,
        status: 'downloaded-size',
      };
    }
    return { destination, status: 'downloaded-checksum' };
  } catch (error) {
    return {
      destination,
      reason: error instanceof Error ? error.message : String(error),
      status: 'download-failure',
    };
  } finally {
    if (temporaryPath) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

async function assertNoSymlinkComponents(
  rootDirectory: string,
  destination: string,
): Promise<void> {
  const relative = path.relative(rootDirectory, destination);
  let current = rootDirectory;

  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const currentStats = await lstat(current);
      if (currentStats.isSymbolicLink()) {
        throw new Error(`Unsafe symlink in local backup path: ${current}`);
      }
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        return;
      }
      throw error;
    }
  }
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
