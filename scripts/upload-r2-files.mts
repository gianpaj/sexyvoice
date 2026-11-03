#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { loadScriptEnv } from './lib/env.mts';
import { createR2S3Client } from './lib/r2-client.mts';
import {
  planR2FileUploads,
  sha256,
  uploadR2File,
} from './lib/r2-file-upload.mts';
import { assertR2BucketName } from './lib/r2-transfer.mts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    bucket: { type: 'string' },
    'content-type': { type: 'string', default: 'application/octet-stream' },
    'dry-run': { type: 'boolean' },
    'env-file': { multiple: true, type: 'string' },
    help: { short: 'h', type: 'boolean' },
    prefix: { type: 'string', default: '' },
    'public-url': { type: 'string' },
  },
});

async function main(): Promise<void> {
  if (values.help) {
    console.log(`Upload one or more files to an R2 bucket. Uploads by default.

pnpm upload-r2-files --bucket sv-audio-files --prefix demo-clones/voxtral-3 --content-type audio/mpeg apps/web/public/demo-clones/voxtral-3/*.mp3

--bucket <name>       Required destination bucket
--prefix <folder>     Destination folder (default: bucket root)
--content-type <mime> Content type for all files (default: application/octet-stream)
--public-url <origin> Also verify public downloads, e.g. https://files.sexyvoice.ai
--env-file <file>     Load R2 credentials; repeatable
--dry-run             Validate files and print destinations without network requests

Paths are relative to the working directory. Shell globs expand into multiple files.
Preserves basenames; rejects duplicate destinations, directories, and symlinks.
Never overwrites different objects. Requires R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
and R2_ENDPOINT. Does not change runtime URLs or delete local files.`);
    return;
  }
  if (!values.bucket) throw new Error('--bucket is required');
  assertR2BucketName(values.bucket);
  const targets = await planR2FileUploads(
    positionals,
    values.prefix,
    values['public-url'],
  );
  for (const target of targets) {
    console.log(`${target.path} -> ${values.bucket}/${target.key}`);
  }
  if (values['dry-run']) {
    console.log(
      `Dry run: ${targets.length} files; no network requests or uploads performed.`,
    );
    return;
  }
  loadScriptEnv(values['env-file']);
  const client = createR2S3Client();
  let failures = 0;
  try {
    for (const target of targets) {
      try {
        const bytes = await readFile(target.path);
        if (sha256(bytes) !== target.sha256)
          throw new Error(`File changed after validation: ${target.path}`);
        await uploadR2File({
          bucket: values.bucket,
          key: target.key,
          bytes,
          contentType: values['content-type'],
          client,
          publicUrl: target.publicUrl,
        });
        console.log(`Verified: ${target.key}`);
      } catch (error) {
        failures += 1;
        console.error(
          `${target.key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    console.log(
      `${targets.length - failures} verified uploads; ${failures} failures.`,
    );
    if (failures) process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
