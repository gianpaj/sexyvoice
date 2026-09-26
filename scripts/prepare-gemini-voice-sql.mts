#!/usr/bin/env -S pnpm exec tsx
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

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

const { values } = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: {
    catalog: { type: 'string' },
    draft: { type: 'boolean' },
    help: { short: 'h', type: 'boolean' },
    out: { type: 'string' },
    samples: { type: 'string' },
  },
});
async function main(): Promise<void> {
  if (values.help) {
    console.log(
      'Prepare additive SQL without executing it.\n\npnpm prepare-gemini-voice-sql --catalog gemini-38-catalog.json --out add-gemini-38-voices.sql --draft\n\nAfter listening and uploading, replace --draft with --samples generated-speech/gemini-38.',
    );
    return;
  }
  if (!(values.catalog && values.out && (values.draft || values.samples)))
    throw new Error(
      '--catalog, --out and either --draft or --samples are required',
    );
  if (values.draft && values.samples)
    throw new Error('Choose --draft or --samples');
  const catalog = (await readSampleCatalog(values.catalog)) as VoiceCatalog;
  const generated = values.samples
    ? await readGenerationManifest(values.samples)
    : undefined;
  if (generated && values.samples) {
    for (const sample of generated.samples)
      await readVerifiedSample(values.samples, sample);
  }
  const uploads = values.samples
    ? (JSON.parse(
        await readFile(path.join(values.samples, 'uploads.json'), 'utf8'),
      ) as UploadManifest)
    : undefined;
  const sql = prepareVoiceCatalogSql(catalog, {
    draft: values.draft,
    generated,
    uploads,
  });
  await writeFile(values.out, sql);
  console.log(
    `Prepared ${catalog.voices.length} rows in ${values.out}. No SQL executed.`,
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
