#!/usr/bin/env -S pnpm exec tsx
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { GoogleGenAI } from '@google/genai';

import pricing from '../apps/web/lib/api/pricing.ts';
import audioHelpers from '../apps/web/lib/audio.ts';
import geminiPrompt from '../apps/web/lib/tts/gemini-prompt.ts';
import geminiResponse from '../apps/web/lib/tts/gemini-response.ts';
import { loadScriptEnv } from './lib/env.mts';
import {
  readSampleCatalog,
  readVerifiedSample,
  type SampleManifest,
  sha256,
  writeJson,
  writeListeningPage,
} from './lib/speech-samples.mts';

const { calculateGenerateApiDollarAmount } = pricing;
const { convertToWav } = audioHelpers;
const { buildGeminiTtsContents, buildGeminiVoiceConfig, GEMINI_TTS_38 } =
  geminiPrompt;
const { classifyGeminiTtsResponse } = geminiResponse;

const { values } = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: {
    catalog: { type: 'string' },
    'dry-run': { type: 'boolean' },
    'env-file': { multiple: true, type: 'string' },
    help: { short: 'h', type: 'boolean' },
    'keep-wav': { type: 'boolean' },
    out: { type: 'string' },
  },
});

function ffmpeg(args: string[]): void {
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
}

async function main(): Promise<void> {
  if (values.help) {
    console.log(`Generate local Gemini 3.8 MP3 samples. Never uploads or writes to the database.

pnpm generate-gemini-speech-samples --catalog catalog.json --out generated-speech/gemini-38

--catalog <file>    Version 1 gpro38 catalog with voices (id, name, language, text, style, filename)
--out <directory>   Dedicated output directory; completed samples resume after hash verification
--env-file <file>   Load a dotenv file; repeat to load multiple files
--dry-run          Validate and show the batch without generation
--keep-wav         Keep intermediate WAV files

Requires GOOGLE_GENERATIVE_AI_API_KEY and ffmpeg. Listen before running upload-speech-samples.`);
    return;
  }
  if (!(values.catalog && values.out))
    throw new Error('--catalog and --out are required');
  const catalog = await readSampleCatalog(values.catalog);
  const output = path.resolve(values.out);
  for (const voice of catalog.voices)
    console.log(
      `${voice.name} (${voice.language}) -> ${path.join(output, voice.filename)}`,
    );
  if (values['dry-run']) return;
  loadScriptEnv(values['env-file']);
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY');
  ffmpeg(['-version']);
  await mkdir(output, { recursive: true });
  const manifestPath = path.join(output, 'manifest.json');
  let manifest: SampleManifest;
  try {
    manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as SampleManifest;
    if (
      manifest.version !== 1 ||
      manifest.model !== GEMINI_TTS_38 ||
      !Array.isArray(manifest.samples)
    )
      throw new Error('Invalid generation manifest');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    manifest = { failures: [], model: GEMINI_TTS_38, samples: [], version: 1 };
  }
  if (
    manifest.samples.some(
      (sample) => !catalog.voices.some((voice) => voice.id === sample.id),
    )
  ) {
    throw new Error(
      'Output directory contains samples from a different catalog',
    );
  }
  for (const voice of catalog.voices) {
    if (manifest.samples.some((sample) => sample.id === voice.id)) continue;
    for (const filename of [voice.filename, `${voice.filename}.wav`]) {
      try {
        await access(path.join(output, filename));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      throw new Error(
        'Untracked output file exists: ' +
          filename +
          '; move it aside before retrying',
      );
    }
  }
  const ai = new GoogleGenAI({ apiKey });
  manifest.failures = [];
  for (const voice of catalog.voices) {
    const existing = manifest.samples.find((sample) => sample.id === voice.id);
    if (existing) {
      for (const key of [
        'name',
        'filename',
        'text',
        'style',
        'language',
      ] as const) {
        if (existing[key] !== voice[key])
          throw new Error(
            `Sample configuration changed for ${voice.name}; use a new output directory`,
          );
      }
      await readVerifiedSample(output, existing);
      console.log(`Verified existing ${voice.filename}`);
      continue;
    }
    try {
      const generatedAt = new Date().toISOString();
      const response = await ai.models.generateContent({
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: buildGeminiVoiceConfig(voice.name, 'gpro38'),
          },
        },
        contents: buildGeminiTtsContents({
          model: 'gpro38',
          styleVariant: voice.style,
          text: voice.text,
        }),
        model: GEMINI_TTS_38,
      });
      const candidate = response.candidates?.[0];
      const audioParts =
        candidate?.content?.parts?.filter((part) =>
          part.inlineData?.mimeType?.startsWith('audio/'),
        ) ?? [];
      const audio = audioParts[0]?.inlineData;
      const outcome = classifyGeminiTtsResponse({
        blockReason: response.promptFeedback?.blockReason,
        finishReason: candidate?.finishReason,
        hasAudio: Boolean(audio?.data),
      });
      if (
        outcome !== 'success' ||
        !audio?.data ||
        !audio.mimeType ||
        audioParts.length !== 1
      )
        throw new Error(
          `Invalid audio response: ${outcome}, ${audioParts.length} audio parts`,
        );
      const usage = response.usageMetadata;
      if (
        usage?.promptTokenCount === undefined ||
        usage.candidatesTokenCount === undefined
      )
        throw new Error('Response has no billable token counts');
      const wavPath = path.join(output, `${voice.filename}.wav`);
      const mp3Path = path.join(output, voice.filename);
      await writeFile(wavPath, convertToWav(audio.data, audio.mimeType), {
        flag: 'wx',
      });
      ffmpeg([
        '-n',
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
      const bytes = await readFile(mp3Path);
      const dollarAmount = calculateGenerateApiDollarAmount({
        model: GEMINI_TTS_38,
        occurredAt: generatedAt,
        provider: 'google',
        sourceType: 'tts',
        ...usage,
      });
      manifest.samples.push({
        ...voice,
        bytes: bytes.length,
        dollarAmount,
        generatedAt,
        sha256: sha256(bytes),
        usage,
      });
      await writeJson(manifestPath, manifest);
      if (!values['keep-wav']) await rm(wavPath);
      console.log(`Saved ${voice.filename} ($${dollarAmount.toFixed(6)})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      manifest.failures.push({ error: message, id: voice.id });
      await writeJson(manifestPath, manifest);
      console.error(`${voice.name}: ${message}`);
    }
  }
  await writeJson(manifestPath, manifest);
  await writeListeningPage(output, manifest.samples);
  console.log(
    `${manifest.samples.length} samples; ${manifest.failures.length} failures. Manifest: ${manifestPath}`,
  );
  if (manifest.failures.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
