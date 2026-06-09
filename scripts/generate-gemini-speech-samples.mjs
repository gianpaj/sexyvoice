#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const scriptStartedAt = new Date().toISOString().replace(/[:.]/g, '-');

config({
  path: [
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, '.env'),
    path.join(repoRoot, 'apps/web/.env.local'),
    path.join(repoRoot, 'apps/web/.env'),
    path.join(scriptDir, '.env.local'),
    path.join(scriptDir, '.env'),
  ],
});

const DEFAULT_VOICES = [
  'achernar',
  'aoede',
  'autonoe',
  'callirrhoe',
  'despina',
  'erinome',
  'gacrux',
  'kore',
  'puck',
  'sulafat',
  'zephyr',
];

const DEFAULT_TEXT =
  "O-oh, god, it's so f-fucking deep in me!";
const DEFAULT_STYLE = 'warm, confident, and natural';

function printHelp() {
  console.log(`Generate Gemini speech samples through /api/v1/speech.

Usage:
  pnpm generate-gemini-speech-samples -- --model gpro --style "calm" --text "Hello" --voices achernar,zephyr

Environment:
  SEXYVOICE_API_KEY       Required Bearer API key
  SEXYVOICE_API_BASE_URL  Optional API host (default: https://sexyvoice.ai)

Options:
  --model <gpro|g31>      Gemini API model alias (default: gpro)
  --text <text>           Text to synthesize
  --style <style>         Gemini style prompt prepended by the API
  --voices <a,b,c>        Comma-separated voice names
  --out <dir>             Output directory (default: scripts/generated-speech)
  --seed <number>         Optional deterministic seed
  --base-url <url>        Override API base URL
  --api-key <key>         Override SEXYVOICE_API_KEY
  --keep-wav              Keep the downloaded WAV next to each MP3
  -h, --help              Show this help

Notes:
  The current external API supports WAV output for gpro/g31, so this script
  downloads WAV files from the API and converts them to MP3 with ffmpeg.`);
}

function readFlag(args, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = args.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const model = readFlag(args, '--model') ?? 'gpro';
  if (model !== 'gpro' && model !== 'g31') {
    throw new Error('--model must be either "gpro" or "g31"');
  }

  const voicesFlag = readFlag(args, '--voices');
  const voices = voicesFlag
    ? voicesFlag
        .split(',')
        .map((voice) => voice.trim())
        .filter(Boolean)
    : DEFAULT_VOICES;

  if (voices.length === 0) {
    throw new Error('--voices must contain at least one voice');
  }

  const seedFlag = readFlag(args, '--seed');
  const seed = seedFlag === undefined ? undefined : Number(seedFlag);
  if (seed !== undefined && !Number.isSafeInteger(seed)) {
    throw new Error('--seed must be a safe integer');
  }

  return {
    apiKey: readFlag(args, '--api-key') ?? process.env.SEXYVOICE_API_KEY,
    baseUrl:
      readFlag(args, '--base-url') ??
      process.env.SEXYVOICE_API_BASE_URL ??
      'https://sexyvoice.ai',
    keepWav: args.includes('--keep-wav'),
    model,
    outDir: path.resolve(
      readFlag(args, '--out') ?? path.join(scriptDir, 'generated-speech'),
    ),
    seed,
    style: readFlag(args, '--style') ?? process.env.NEXT_PUBLIC_STYLE_PROMPT_VARIANT_MOAN,
    text: readFlag(args, '--text') ?? DEFAULT_TEXT,
    voices,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function postSpeech({
  apiKey,
  baseUrl,
  model,
  voice,
  text,
  style,
  seed,
}) {
  console.log({}, `${baseUrl.replace(/\/$/, '')}/api/v1/speech`);
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      style,
      ...(seed === undefined ? {} : { seed }),
    }),
  });

  const requestId = response.headers.get('request-id');
  const bodyText = await response.json();

  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body?.error?.message ?? bodyText ?? response.statusText;
    throw new Error(
      `Speech API failed for ${voice} (${response.status}${requestId ? `, request-id: ${requestId}` : ''}): ${message}`,
    );
  }

  if (!body?.url) {
    throw new Error(`Speech API response for ${voice} did not include a url`);
  }

  return { ...body, requestId };
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!(response.ok && response.body)) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    );
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(destination),
  );
}

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(
          new Error('ffmpeg is required to convert Gemini WAV output to MP3'),
        );
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function assertFfmpegAvailable() {
  await runFfmpeg(['-version']);
}

async function convertWavToMp3(wavPath, mp3Path) {
  await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    wavPath,
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '2',
    mp3Path,
  ]);
}

async function generateForVoice(options, voice) {
  const basename = `${scriptStartedAt}-${options.model}_${slugify(voice)}`;
  const wavPath = path.join(options.outDir, `${basename}.wav`);
  const mp3Path = path.join(options.outDir, `${basename}.mp3`);

  console.log(`\n▶ Generating ${voice} (${options.model})`);
  const result = await postSpeech({ ...options, voice });
  console.log(
    `  API ok: ${result.usage?.model ?? options.model}, ${result.credits_used} credits${result.requestId ? `, request-id ${result.requestId}` : ''}`,
  );

  await downloadFile(result.url, wavPath);
  await convertWavToMp3(wavPath, mp3Path);

  if (!options.keepWav) {
    await rm(wavPath, { force: true });
  }

  console.log(`  MP3: ${mp3Path}`);
  return { voice, mp3Path, url: result.url };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.apiKey) {
    throw new Error(
      'Missing SEXYVOICE_API_KEY. Set it in your env or pass --api-key.',
    );
  }

  await assertFfmpegAvailable();
  await mkdir(options.outDir, { recursive: true });

  console.log(
    `Generating ${options.voices.length} sample(s) via ${options.baseUrl}`,
  );
  console.log(`Model: ${options.model}`);
  console.log(`Style: ${options.style}`);
  console.log(`Output: ${options.outDir}`);

  const results = [];
  for (const voice of options.voices) {
    results.push(await generateForVoice(options, voice));
  }

  console.log('\nDone. Generated MP3 files:');
  for (const result of results) {
    console.log(`- ${result.voice}: ${result.mp3Path}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
