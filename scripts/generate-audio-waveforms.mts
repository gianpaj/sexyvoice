#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import {
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  assertWaveformPoints,
  DEFAULT_WAVEFORM_POINTS,
  extractAudioWaveform,
} from './lib/audio-waveform-peaks.mts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isCurrent(
  asset: Record<string, unknown>,
  hash: string,
  points: number,
): boolean {
  const waveform = asset.waveform;
  return (
    typeof asset.durationSeconds === 'number' &&
    Number.isFinite(asset.durationSeconds) &&
    asset.durationSeconds > 0 &&
    asset.sha256 === hash &&
    isRecord(waveform) &&
    waveform.sourceSha256 === hash &&
    Array.isArray(waveform.peaks) &&
    waveform.peaks.length >= 1 &&
    waveform.peaks.length <= 8 &&
    waveform.peaks.every(
      (channel: unknown) =>
        Array.isArray(channel) &&
        channel.length === points &&
        channel.every(
          (value: unknown) =>
            typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= -1 &&
            value <= 1,
        ),
    )
  );
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'audio-dir': { type: 'string' },
      manifest: { type: 'string' },
      points: { type: 'string' },
      force: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(`Generate waveform peaks from final local audio files. Never changes audio or calls external APIs.

pnpm generate-audio-waveforms [options] [audio files...]

With no files, process every asset already listed in the manifest.
Explicit files add or update entries keyed by filename; duplicate filenames are rejected.

--audio-dir <dir>   Directory for manifest-listed files (default: apps/web/public/demo-clones/voxtral-3)
--manifest <file>   Existing JSON manifest with an assets object (default: apps/web/data/clone-demo-assets.json)
--points <number>  Peaks per channel, 1–4096 (default: ${DEFAULT_WAVEFORM_POINTS})
--force            Recompute even when the audio hash and peak count match
--help             Show this help

Requires ffmpeg and ffprobe for files needing generation. Matching waveforms are skipped.`);
    return;
  }

  const points =
    values.points === undefined
      ? DEFAULT_WAVEFORM_POINTS
      : Number(values.points);
  assertWaveformPoints(points);
  const root = resolve(import.meta.dirname, '..');
  const audioDirectory = resolve(
    values['audio-dir'] ??
      resolve(root, 'apps/web/public/demo-clones/voxtral-3'),
  );
  const manifestPath = resolve(
    values.manifest ?? resolve(root, 'apps/web/data/clone-demo-assets.json'),
  );
  const original = readFileSync(manifestPath, 'utf8');
  const manifest: unknown = JSON.parse(original);
  if (!(isRecord(manifest) && isRecord(manifest.assets))) {
    throw new Error('Manifest must be a JSON object with an assets object');
  }
  const assets = manifest.assets;
  const files = positionals.length
    ? positionals.map((path) => ({ path: resolve(path), key: basename(path) }))
    : Object.keys(assets).map((key) => {
        if (
          isAbsolute(key) ||
          key
            .split(/[\\/]/)
            .some((part) => !part || part === '.' || part === '..')
        ) {
          throw new Error(`Expected a relative asset filename: ${key}`);
        }
        return { path: resolve(audioDirectory, key), key };
      });
  if (!files.length) throw new Error('No audio files selected');
  const names = new Set<string>();
  for (const file of files) {
    if (names.has(file.key))
      throw new Error(`Duplicate asset filename: ${file.key}`);
    names.add(file.key);
    if (file.path === manifestPath)
      throw new Error('The manifest cannot also be an audio input');
    if (!statSync(file.path).isFile())
      throw new Error(`Expected an audio file: ${file.path}`);
    if (assets[file.key] !== undefined && !isRecord(assets[file.key])) {
      throw new Error(`Expected asset metadata to be an object: ${file.key}`);
    }
  }

  let updated = 0;
  let skipped = 0;
  for (const file of files) {
    const hash = sha256(file.path);
    const entry = assets[file.key];
    const previous = isRecord(entry) ? entry : {};
    if (!values.force && isCurrent(previous, hash, points)) {
      console.log(`${file.key}: unchanged`);
      skipped += 1;
      continue;
    }
    const waveform = extractAudioWaveform(file.path, points);
    if (sha256(file.path) !== hash) {
      throw new Error(
        `Audio changed during extraction; rerun for ${file.path}`,
      );
    }
    assets[file.key] = {
      ...previous,
      durationSeconds: waveform.durationSeconds,
      sha256: hash,
      waveform: { sourceSha256: hash, peaks: waveform.peaks },
    };
    updated += 1;
    console.log(
      `${file.key}: generated ${points} peaks × ${waveform.peaks.length} channel(s)`,
    );
  }
  if (!updated) {
    console.log(`All ${skipped} waveforms are current; no files changed.`);
    return;
  }
  if (readFileSync(manifestPath, 'utf8') !== original) {
    throw new Error(
      'Manifest changed during extraction; rerun without overwriting the concurrent edit',
    );
  }
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  const temporary = `${manifestPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, output, { flag: 'wx' });
    renameSync(temporary, manifestPath);
  } finally {
    rmSync(temporary, { force: true });
  }
  console.log(
    `Updated ${updated} waveform(s) in ${manifestPath} (${Buffer.byteLength(output)} bytes); skipped ${skipped}.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
