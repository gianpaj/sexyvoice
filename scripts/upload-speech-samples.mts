#!/usr/bin/env -S pnpm exec tsx
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadScriptEnv } from './lib/env.mts';
import { createR2S3Client } from './lib/r2-client.mts';
import { assertR2BucketName } from './lib/r2-transfer.mts';
import {
  planSampleUploads,
  readGenerationManifest,
  uploadSamples,
} from './lib/speech-sample-upload.mts';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: {
    bucket: { type: 'string' },
    'dry-run': { type: 'boolean' },
    'env-file': { multiple: true, type: 'string' },
    folder: { type: 'string' },
    help: { short: 'h', type: 'boolean' },
    path: { type: 'string' },
    'public-url': { type: 'string' },
    upload: { type: 'boolean' },
    voices: { type: 'string' },
  },
});

async function main(): Promise<void> {
  if (values.help) {
    console.log(`Upload reviewed speech samples to R2. Defaults to a dry run.

pnpm upload-speech-samples --path generated-speech/gemini-38 --bucket <bucket> --folder <folder> --public-url https://files.sexyvoice.ai --dry-run

--upload             Upload after listening; refuses to overwrite different objects
--voices <id,id>      Select reviewed catalog UUIDs (default: all generated samples)
--env-file <file>     Load R2 credentials from a dotenv file; repeatable

Requires manifest.json in the sample directory. Uploads only verified local MP3s.
Writes uploads.json with verified public URLs and failures. Never executes SQL.`);
    return;
  }
  if (!(values.path && values.bucket && values.folder && values['public-url']))
    throw new Error('--path, --bucket, --folder and --public-url are required');
  if (values.upload && values['dry-run'])
    throw new Error('Choose either --upload or --dry-run');
  assertR2BucketName(values.bucket);
  const directory = path.resolve(values.path);
  const manifest = await readGenerationManifest(directory);
  const ids = values.voices?.split(',');
  if (ids?.some((id) => !manifest.samples.some((sample) => sample.id === id)))
    throw new Error('--voices contains an unknown catalog ID');
  if (!ids && manifest.failures.length)
    throw new Error(
      'Generation has failures; regenerate them or select reviewed voices explicitly',
    );
  const samples = manifest.samples.filter(
    (sample) => !ids || ids.includes(sample.id),
  );
  const targets = await planSampleUploads({
    directory,
    prefix: values.folder,
    publicUrl: values['public-url'],
    samples,
  });
  for (const target of targets)
    console.log(
      `${target.filename} -> ${values.bucket}/${target.key}\n  ${target.url}`,
    );
  if (!values.upload) {
    console.log(
      'Dry run: no network requests or uploads performed. Listen before using --upload.',
    );
    return;
  }
  loadScriptEnv(values['env-file']);
  const client = createR2S3Client();
  try {
    const result = await uploadSamples({
      bucket: values.bucket,
      client,
      directory,
      samples,
      targets,
    });
    console.log(
      `${result.verified.length} verified uploads; ${result.failures.length} failures. See ${path.join(directory, 'uploads.json')}`,
    );
    if (result.failures.length) process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
