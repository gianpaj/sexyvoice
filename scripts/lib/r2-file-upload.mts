import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import { isPreconditionFailed } from './r2-client.mts';
import {
  parsePublicOrigin,
  r2Folder,
  r2ObjectKey,
  r2PublicUrl,
} from './r2-keys.mts';

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface R2FileUpload {
  key: string;
  path: string;
  publicUrl?: string;
  sha256: string;
}

export async function planR2FileUploads(
  files: string[],
  prefix: string,
  publicUrl?: string,
): Promise<R2FileUpload[]> {
  if (!files.length) throw new Error('Provide at least one file');
  const folder = r2Folder(prefix);
  if (publicUrl) parsePublicOrigin(publicUrl);
  const keys = new Set<string>();
  const targets: R2FileUpload[] = [];
  for (const file of files) {
    const filename = path.resolve(file);
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Expected a regular file: ${filename}`);
    const key = r2ObjectKey(folder, path.basename(filename));
    if (keys.has(key)) throw new Error(`Duplicate destination: ${key}`);
    keys.add(key);
    targets.push({
      path: filename,
      key,
      sha256: sha256(await readFile(filename)),
      publicUrl: publicUrl ? r2PublicUrl(publicUrl, key) : undefined,
    });
  }
  return targets;
}

export async function uploadR2File(options: {
  bucket: string;
  key: string;
  bytes: Buffer;
  contentType: string;
  client: Pick<S3Client, 'send'>;
  publicUrl?: string;
  fetchPublic?: typeof fetch;
}): Promise<void> {
  const {
    bucket,
    key,
    bytes,
    contentType,
    client,
    publicUrl,
    fetchPublic = fetch,
  } = options;
  const hash = sha256(bytes);
  try {
    await client.send(
      new PutObjectCommand({
        Body: bytes,
        Bucket: bucket,
        ContentType: contentType,
        IfNoneMatch: '*',
        Key: key,
        Metadata: { sha256: hash },
      }),
    );
  } catch (error) {
    // An existing object is verified below; it is never overwritten.
    if (!isPreconditionFailed(error)) throw error;
  }
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (
    head.ContentLength !== bytes.length ||
    head.ContentType !== contentType ||
    head.Metadata?.sha256 !== hash
  ) {
    throw new Error(`R2 object does not match the local file: ${key}`);
  }
  if (!publicUrl) return;
  const response = await fetchPublic(publicUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (
    !response.ok ||
    response.headers.get('content-type')?.split(';')[0] !== contentType
  ) {
    throw new Error(`Public file unavailable: HTTP ${response.status}`);
  }
  if (sha256(new Uint8Array(await response.arrayBuffer())) !== hash) {
    throw new Error('Public file hash differs from the local file');
  }
}
