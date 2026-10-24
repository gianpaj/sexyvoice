#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  CLONE_DEMO_MODEL,
  CLONE_DEMO_TAKES,
  CLONE_DEMO_VOICES,
  getCloneDemoPrompt,
  getCloneDemoTakes,
} from '../apps/web/data/clone-demo-config.ts';
import { getVoxtralDollarCost } from '../apps/web/lib/clone/voxtral.ts';
import { normalizeCloneDemoAudio } from './lib/clone-demo-audio.mts';
import { loadScriptEnv } from './lib/env.mts';

const { values } = parseArgs({
  options: {
    'env-file': { type: 'string', multiple: true },
    'reference-dir': { type: 'string' },
    'output-dir': { type: 'string' },
    voice: { type: 'string' },
    take: { type: 'string' },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  console.log(
    'Generate Voxtral clone demos from existing reference MP3s.\n--reference-dir <dir> --output-dir <new-dir> [--voice kat|heike] [--take sameOriginal|natural|sarcastic|calmSlow] [--env-file <file>]\nDefaults to all voices and takes. Requires ffmpeg, ffprobe, MISTRAL_API_KEY. Does not upload files or write database rows.',
  );
  process.exit(0);
}
const voices = CLONE_DEMO_VOICES.filter(
  (voice) => !values.voice || voice.id === values.voice,
);
const takes = CLONE_DEMO_TAKES.filter(
  (take) => !values.take || take.id === values.take,
);
if (!voices.length) throw new Error(`Unknown voice: ${values.voice}`);
if (!takes.length) throw new Error(`Unknown take: ${values.take}`);
const selections = voices
  .map((voice) => ({
    voice,
    takes: getCloneDemoTakes(voice).filter(
      (take) => !values.take || take.id === values.take,
    ),
  }))
  .filter(({ takes }) => takes.length);
if (!selections.length)
  throw new Error(`Unsupported demo selection: ${values.voice}/${values.take}`);

if (!(values['reference-dir'] && values['output-dir']))
  throw new Error('--reference-dir and --output-dir are required');
loadScriptEnv(values['env-file']);
const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) throw new Error('MISTRAL_API_KEY is not configured');
const directory = resolve(values['output-dir']);
await mkdir(directory);

function duration(path: string): number {
  const value = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        path,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  if (!(Number.isFinite(value) && value > 0))
    throw new Error(`Invalid audio duration: ${path}`);
  return value;
}

const assets: Record<string, { durationSeconds: number; sha256: string }> = {};
const requests = [] as {
  voice: string;
  take: string;
  input: string;
  sourceHash: string;
  latencyMs: number;
  estimatedCostUsd: number;
  requestId: string | null;
}[];
const sourceHashes: Record<string, string> = {};
async function recordAsset(filename: string) {
  const bytes = await readFile(join(directory, filename));
  assets[filename] = {
    durationSeconds: duration(join(directory, filename)),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function writeReport() {
  await writeFile(
    join(directory, 'generation.json'),
    `${JSON.stringify({ model: CLONE_DEMO_MODEL, sourceHashes, requests, assets }, null, 2)}\n`,
  );
}

for (const { voice, takes } of selections) {
  const source = join(
    resolve(values['reference-dir']),
    `${voice.id}-reference.mp3`,
  );
  sourceHashes[voice.id] = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
  const referenceName = `${voice.id}-reference.mp3`;
  const referenceWav = join(directory, `${voice.id}-reference.wav`);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    source,
    '-ac',
    '1',
    '-ar',
    '24000',
    referenceWav,
  ]);
  normalizeCloneDemoAudio(source, join(directory, referenceName));
  await recordAsset(referenceName);
  const reference = (await readFile(referenceWav)).toString('base64');

  for (const take of takes) {
    const input = getCloneDemoPrompt(voice, take.id);
    const startedAt = performance.now();
    const response = await fetch('https://api.mistral.ai/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLONE_DEMO_MODEL,
        input,
        ref_audio: reference,
        response_format: 'wav',
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok)
      throw new Error(
        `Mistral ${voice.id}/${take.id}: HTTP ${response.status}`,
      );
    const payload = (await response.json()) as { audio_data?: string };
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!payload.audio_data) throw new Error('Mistral returned no audio_data');
    const bytes = Buffer.from(payload.audio_data, 'base64');
    if (
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE'
    )
      throw new Error('Mistral returned invalid WAV audio');
    const rawWav = join(directory, `${voice.id}-${take.id}.wav`);
    await writeFile(rawWav, bytes, { flag: 'wx' });
    const filename = `${voice.id}-${take.id}.mp3`;
    requests.push({
      voice: voice.id,
      take: take.id,
      input,
      sourceHash: sourceHashes[voice.id],
      latencyMs,
      estimatedCostUsd: getVoxtralDollarCost(CLONE_DEMO_MODEL, input),
      requestId: response.headers.get('x-request-id'),
    });
    await writeReport();
    normalizeCloneDemoAudio(rawWav, join(directory, filename));
    await recordAsset(filename);
    await writeReport();
    console.log(
      `${voice.id}/${take.id}: ${assets[filename].durationSeconds.toFixed(2)}s, ${latencyMs}ms, estimated $${getVoxtralDollarCost(CLONE_DEMO_MODEL, input).toFixed(6)}`,
    );
  }
}
console.log(`Prepared ${requests.length} takes in ${directory}`);
