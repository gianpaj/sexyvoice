import { createHash } from 'node:crypto';
import { lstat, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GenerateContentResponseUsageMetadata } from '@google/genai';

import voiceNames from '../../apps/web/lib/voice-names.ts';

export interface SampleVoice {
  filename: string;
  id: string;
  language: string;
  name: string;
  style: string;
  text: string;
}

export interface SampleCatalog {
  model: 'gpro38';
  version: 1;
  voices: SampleVoice[];
}

export interface GeneratedSample extends SampleVoice {
  bytes: number;
  dollarAmount: number;
  generatedAt: string;
  sha256: string;
  usage: GenerateContentResponseUsageMetadata;
}

export interface SampleManifest {
  failures: { id: string; error: string }[];
  model: 'gemini-3.8-flash-tts';
  samples: GeneratedSample[];
  version: 1;
}

export function assertSampleVoice(value: SampleVoice): void {
  for (const key of [
    'id',
    'name',
    'language',
    'text',
    'style',
    'filename',
  ] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim()) {
      throw new Error(`Missing sample ${key}`);
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(value.name)) {
    throw new Error(`Invalid provider voice: ${value.name}`);
  }
  if (/^ca(?:-|$)/i.test(value.language) || /^ca-/i.test(value.name)) {
    throw new Error('Catalan voices are excluded from this catalog');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.mp3$/.test(value.filename)) {
    throw new Error(`Expected an MP3 basename: ${value.filename}`);
  }
  if (value.text.length + value.style.length > 4000) {
    throw new Error(
      `Sample text and style exceed 4000 characters: ${value.name}`,
    );
  }
}

export function assertUniqueSamples(voices: SampleVoice[]): void {
  for (const key of ['id', 'filename'] as const) {
    const values = voices.map((voice) => voice[key]);
    if (new Set(values).size !== values.length) {
      throw new Error(`Duplicate sample ${key}`);
    }
  }
}

export async function readSampleCatalog(
  filename: string,
): Promise<SampleCatalog> {
  const catalog = JSON.parse(await readFile(filename, 'utf8')) as SampleCatalog;
  if (
    catalog.version !== 1 ||
    catalog.model !== 'gpro38' ||
    !Array.isArray(catalog.voices) ||
    !catalog.voices.length
  ) {
    throw new Error('Expected a version 1 gpro38 catalog with voices');
  }
  for (const voice of catalog.voices) assertSampleVoice(voice);
  assertUniqueSamples(catalog.voices);
  return catalog;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readVerifiedSample(
  directory: string,
  sample: GeneratedSample,
): Promise<Buffer> {
  assertSampleVoice(sample);
  const filename = path.join(directory, sample.filename);
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Expected a regular file: ${filename}`);
  const bytes = await readFile(filename);
  if (bytes.length !== sample.bytes || sha256(bytes) !== sample.sha256) {
    throw new Error(`Sample changed since generation: ${filename}`);
  }
  return bytes;
}

export async function writeJson(
  filename: string,
  value: unknown,
): Promise<void> {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, filename);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function writeListeningPage(
  directory: string,
  samples: GeneratedSample[],
): Promise<void> {
  const entries = samples
    .map(
      (
        sample,
      ) => `<article><h2>${escapeHtml(voiceNames.getVoiceDisplayName({ model: 'gpro38', name: sample.name }))} <small>${escapeHtml(sample.language)}</small></h2>
<p>${escapeHtml(sample.text)}</p><p><small>${escapeHtml(sample.style)}</small></p>
<audio controls preload="none" src="${encodeURIComponent(sample.filename)}"></audio>
<p><small>Catalog ID: ${escapeHtml(sample.id)}</small></p></article>`,
    )
    .join('\n');
  await writeFile(
    path.join(directory, 'listen.html'),
    `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gemini 3.8 voice samples</title>
<style>body{font:17px/1.5 system-ui;max-width:800px;margin:40px auto;padding:0 20px;background:#fafafa;color:#222}article{border-top:1px solid #ccc;padding:20px 0}h2{font-size:20px}small{font-size:14px;color:#555}audio{width:100%}</style>
<h1>Gemini 3.8 voice samples</h1><p>${samples.length} local previews. Listen before uploading to R2.</p>
${entries}</html>\n`,
  );
}
