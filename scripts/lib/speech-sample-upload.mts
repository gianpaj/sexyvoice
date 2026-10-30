import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';

import { uploadR2File } from './r2-file-upload.mts';
import {
  assertUniqueSamples,
  type GeneratedSample,
  readVerifiedSample,
  type SampleManifest,
  writeJson,
} from './speech-samples.mts';

export interface UploadTarget {
  filename: string;
  id: string;
  key: string;
  sha256: string;
  url: string;
}

export interface UploadManifest {
  bucket: string;
  failures: { id: string; error: string }[];
  verified: UploadTarget[];
  version: 1;
}

export async function readGenerationManifest(
  directory: string,
): Promise<SampleManifest> {
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'manifest.json'), 'utf8'),
  ) as SampleManifest;
  if (
    manifest.version !== 1 ||
    manifest.model !== 'gemini-3.8-flash-tts' ||
    !Array.isArray(manifest.samples) ||
    !manifest.samples.length
  ) {
    throw new Error('Expected a Gemini 3.8 generation manifest with samples');
  }
  assertUniqueSamples(manifest.samples);
  return manifest;
}

export async function planSampleUploads(options: {
  directory: string;
  prefix: string;
  publicUrl: string;
  samples: GeneratedSample[];
}): Promise<UploadTarget[]> {
  const { directory, samples } = options;
  const prefix = options.prefix === '.' ? '' : options.prefix;
  if (
    prefix.length > 0 &&
    prefix.split('/').some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))
  ) {
    throw new Error(
      'Folder must contain nonempty path segments using letters, numbers, underscores or hyphens',
    );
  }
  const base = new URL(options.publicUrl);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/'
  ) {
    throw new Error('Public URL must be an HTTPS origin');
  }
  assertUniqueSamples(samples);
  const targets: UploadTarget[] = [];
  for (const sample of samples) {
    await readVerifiedSample(directory, sample);
    const key = prefix ? `${prefix}/${sample.filename}` : sample.filename;
    targets.push({
      filename: sample.filename,
      id: sample.id,
      key,
      sha256: sample.sha256,
      url: new URL(key, base).href,
    });
  }
  return targets;
}

export async function uploadSamples(options: {
  directory: string;
  bucket: string;
  samples: GeneratedSample[];
  targets: UploadTarget[];
  client: Pick<S3Client, 'send'>;
  fetchPublic?: typeof fetch;
}): Promise<UploadManifest> {
  const { directory, bucket, samples, targets, client, fetchPublic } = options;
  const manifest: UploadManifest = {
    bucket,
    failures: [],
    verified: [],
    version: 1,
  };
  const manifestPath = path.join(directory, 'uploads.json');
  for (const target of targets) {
    try {
      const sample = samples.find((item) => item.id === target.id);
      if (!sample) throw new Error(`Missing sample ${target.id}`);
      const bytes = await readVerifiedSample(directory, sample);
      await uploadR2File({
        bucket,
        key: target.key,
        bytes,
        contentType: 'audio/mpeg',
        client,
        publicUrl: target.url,
        fetchPublic,
      });
      manifest.verified.push(target);
    } catch (error) {
      manifest.failures.push({
        error: error instanceof Error ? error.message : String(error),
        id: target.id,
      });
    }
    await writeJson(manifestPath, manifest);
  }
  return manifest;
}
