#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  getVoxtralDollarCost,
  VOXTRAL_DOLLARS_PER_MILLION_CHARACTERS,
  type VoxtralModel,
} from '../apps/web/lib/clone/voxtral.ts';
import { loadScriptEnv } from './lib/env.mts';

const { values } = parseArgs({
  options: {
    help: { type: 'boolean' },
    'output-dir': { type: 'string' },
    reference: { type: 'string' },
    'text-file': { type: 'string' },
  },
});

if (values.help) {
  console.log(
    'Usage: pnpm --filter @sexyvoice/scripts exec node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON compare-voxtral.mts --reference /path/voice.wav --text-file /path/text.txt [--output-dir /path/new-directory]',
  );
  process.exit(0);
}

if (!(values.reference && values['text-file'])) {
  throw new Error(
    '--reference and --text-file are required. Use --help for usage.',
  );
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
loadScriptEnv([
  join(repoRoot, 'apps/web/.env.local'),
  join(repoRoot, 'apps/web/.env'),
  join(repoRoot, '.env.local'),
  join(repoRoot, '.env'),
  join(scriptDir, '.env.local'),
  join(scriptDir, '.env'),
]);

const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  throw new Error('MISTRAL_API_KEY is not configured');
}

const referencePath = resolve(values.reference);
if (!['.wav', '.mp3'].includes(extname(referencePath).toLowerCase())) {
  throw new Error('The reference must be a WAV or MP3 file.');
}
const reference = await readFile(referencePath);
const text = await readFile(resolve(values['text-file']), 'utf8');
if (!(reference.length && text.trim())) {
  throw new Error('Reference audio and text must not be empty.');
}

const outputDir = values['output-dir']
  ? resolve(values['output-dir'])
  : await mkdtemp(join(tmpdir(), 'voxtral-comparison-'));
if (values['output-dir']) {
  // Refuse an existing directory so earlier comparisons cannot be overwritten.
  await mkdir(outputDir);
}

type ComparisonResult = {
  latencyMs: number;
  model: VoxtralModel;
} & (
  | {
      estimatedCostUsd: number;
      output: string;
      requestId: string | null;
      status: 'success';
    }
  | { error: string; status: 'error' }
);

const results: ComparisonResult[] = [];
for (const model of Object.keys(
  VOXTRAL_DOLLARS_PER_MILLION_CHARACTERS,
) as VoxtralModel[]) {
  const body = JSON.stringify({
    input: text,
    model,
    ref_audio: reference.toString('base64'),
    response_format: 'wav',
  });
  const startedAt = performance.now();
  try {
    const response = await fetch('https://api.mistral.ai/v1/audio/speech', {
      body,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(180_000),
    });
    const responseBody = await response.text();
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      throw new Error(`Mistral returned HTTP ${response.status}`);
    }
    const payload = JSON.parse(responseBody) as { audio_data?: string };
    if (typeof payload.audio_data !== 'string') {
      throw new Error('Mistral response is missing base64 audio_data');
    }
    const audio = Buffer.from(payload.audio_data, 'base64');
    if (
      audio.length <= 44 ||
      audio.toString('ascii', 0, 4) !== 'RIFF' ||
      audio.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw new Error('Mistral response is not a WAV file');
    }
    const output = join(outputDir, `${model}.wav`);
    await writeFile(output, audio, { flag: 'wx' });
    results.push({
      estimatedCostUsd: getVoxtralDollarCost(model, text),
      latencyMs,
      model,
      output,
      requestId: response.headers.get('x-request-id'),
      status: 'success',
    });
  } catch (error) {
    results.push({
      error: error instanceof Error ? error.message : 'Unknown failure',
      latencyMs: Math.round(performance.now() - startedAt),
      model,
      status: 'error',
    });
    process.exitCode = 1;
  }
  console.log(results.at(-1));
}

await writeFile(
  join(outputDir, 'comparison.json'),
  `${JSON.stringify(
    {
      characters: text.length,
      costBasis:
        'Estimated from input characters at published rates; not billed usage',
      createdAt: new Date().toISOString(),
      latencyBasis:
        'Single sequential request per model, through full response download; no retries',
      referenceSha256: createHash('sha256').update(reference).digest('hex'),
      results,
      text,
    },
    null,
    2,
  )}\n`,
  { flag: 'wx' },
);
console.log(`Saved comparison to ${outputDir}`);
