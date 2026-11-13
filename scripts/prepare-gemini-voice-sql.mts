#!/usr/bin/env -S pnpm exec tsx
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { inputPath, parseCliArgs, runScript } from './lib/cli.mts';
import {
  readGenerationManifest,
  type UploadManifest,
} from './lib/speech-sample-upload.mts';
import {
  readSampleCatalog,
  readVerifiedSample,
} from './lib/speech-samples.mts';
import {
  prepareVoiceCatalogSql,
  type VoiceCatalog,
} from './lib/voice-catalog-sql.mts';

async function main(): Promise<void> {
  const { values } = parseCliArgs({
    options: {
      catalog: { type: 'string' },
      draft: { type: 'boolean' },
      help: { short: 'h', type: 'boolean' },
      out: { type: 'string' },
      samples: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(
      'Prepare additive SQL without executing it.\n\npnpm prepare-gemini-voice-sql --catalog scripts/gemini-38-catalog.json --out scripts/add-gemini-38-voices.sql --draft\n\nAfter listening and uploading, replace --draft with --samples scripts/generated-speech/gemini-38.',
    );
    return;
  }
  if (!(values.catalog && values.out && (values.draft || values.samples)))
    throw new Error(
      '--catalog, --out and either --draft or --samples are required',
    );
  if (values.draft && values.samples)
    throw new Error('Choose --draft or --samples');
  const catalog = (await readSampleCatalog(
    inputPath(values.catalog),
  )) as VoiceCatalog;
  const samples = values.samples && inputPath(values.samples);
  const generated = samples ? await readGenerationManifest(samples) : undefined;
  if (generated && samples) {
    for (const sample of generated.samples)
      await readVerifiedSample(samples, sample);
  }
  const uploads = samples
    ? (JSON.parse(
        await readFile(path.join(samples, 'uploads.json'), 'utf8'),
      ) as UploadManifest)
    : undefined;
  const sql = prepareVoiceCatalogSql(catalog, {
    draft: values.draft,
    generated,
    uploads,
  });
  await writeFile(inputPath(values.out), sql);
  console.log(
    `Prepared ${catalog.voices.length} rows in ${values.out}. No SQL executed.`,
  );
}
runScript(import.meta.url, main);
