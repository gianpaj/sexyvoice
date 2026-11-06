#!/usr/bin/env -S pnpm exec tsx
import { spawnSync } from 'node:child_process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fal } from '@fal-ai/client';

import { loadScriptEnv } from './lib/env.mts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: {
    'dry-run': { type: 'boolean' },
    'env-file': { multiple: true, type: 'string' },
    help: { short: 'h', type: 'boolean' },
    'max-seconds': { default: '60', type: 'string' },
    out: { default: 'generated-speech/audio-cleanup', type: 'string' },
  },
});

const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
]);

interface FalAudioFile {
  content_type?: string;
  url?: string;
}

interface Cleaner {
  dollarCost: (seconds: number) => number;
  extension: string;
  id: string;
  input: (audioUrl: string) => Record<string, unknown>;
  model: string;
  outputFile: (data: Record<string, unknown>) => FalAudioFile | undefined;
}

// DeepFilterNet3 mirrors apps/web/lib/clone/reference-audio-enhancement.ts.
const CLEANERS: Cleaner[] = [
  {
    dollarCost: (seconds) => seconds * 0.001,
    extension: 'wav',
    id: 'deepfilternet3',
    input: (audioUrl) => ({
      audio_format: 'wav',
      audio_url: audioUrl,
      bitrate: '16k',
    }),
    model: 'fal-ai/deepfilternet3',
    outputFile: (data) => data.audio_file as FalAudioFile | undefined,
  },
  {
    dollarCost: (seconds) => Math.max(1, Math.ceil(seconds / 60)) * 0.0125,
    extension: 'wav',
    id: 'veed-clean-audio',
    input: (audioUrl) => ({ audio_url: audioUrl, output_format: 'wav' }),
    model: 'veed/clean-audio',
    outputFile: (data) => data.audio as FalAudioFile | undefined,
  },
];

interface CleanResult {
  cleaner: string;
  dollarCost?: number;
  error?: string;
  filename?: string;
  seconds?: number;
}

interface SampleResult {
  durationSeconds: number;
  input: string;
  results: CleanResult[];
  slug: string;
  sourceFilename: string;
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr}`);
  return result.stdout;
}

function probeDuration(file: string): number {
  return Number(
    run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ]).trim(),
  );
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function collectAudioFiles(inputs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    const entries = await readdir(input, { withFileTypes: true }).catch(
      () => null,
    );
    if (!entries) {
      files.push(path.resolve(input));
      continue;
    }
    files.push(
      ...(await collectAudioFiles(
        entries.map((entry) => path.join(input, entry.name)),
      )),
    );
  }
  return files
    .filter((file) => AUDIO_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function slugify(file: string): string {
  return path
    .basename(file, path.extname(file))
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function cleanSample(
  cleaner: Cleaner,
  sourcePath: string,
  outputPath: string,
  durationSeconds: number,
): Promise<CleanResult> {
  const base = {
    cleaner: cleaner.id,
    dollarCost: cleaner.dollarCost(durationSeconds),
    filename: path.basename(outputPath),
  };
  if (await exists(outputPath)) return base;

  const started = performance.now();
  try {
    const audioUrl = await fal.storage.upload(
      new Blob([await readFile(sourcePath)], { type: 'audio/wav' }),
    );
    const result = await fal.subscribe(cleaner.model, {
      input: cleaner.input(audioUrl),
      logs: false,
    });
    const url = cleaner.outputFile(result.data as Record<string, unknown>)?.url;
    if (!url) throw new Error('No audio URL in response');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    return { ...base, seconds: (performance.now() - started) / 1000 };
  } catch (error) {
    return {
      cleaner: cleaner.id,
      error: Error.isError(error) ? error.message : String(error),
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function audioCell(label: string, filename?: string, note?: string): string {
  const player = filename
    ? `<audio controls preload="none" src="${encodeURIComponent(filename)}"></audio>`
    : '';
  return `<div><h3>${escapeHtml(label)}</h3>${player}<small>${escapeHtml(note ?? '')}</small></div>`;
}

async function writeListeningPage(
  directory: string,
  samples: SampleResult[],
): Promise<void> {
  const totals = CLEANERS.map((cleaner) => {
    const cost = samples
      .flatMap((sample) => sample.results)
      .filter((result) => result.cleaner === cleaner.id)
      .reduce((sum, result) => sum + (result.dollarCost ?? 0), 0);
    return `${cleaner.id}: $${cost.toFixed(4)}`;
  }).join(' · ');
  const entries = samples
    .map((sample) => {
      const cells = sample.results.map((result) =>
        audioCell(
          result.cleaner,
          result.filename,
          result.error
            ? `Error: ${result.error}`
            : `$${result.dollarCost?.toFixed(4)}${result.seconds ? ` · ${result.seconds.toFixed(1)}s` : ''}`,
        ),
      );
      return `<article><h2>${escapeHtml(sample.slug)}</h2><p><small>${escapeHtml(sample.input)} · ${sample.durationSeconds.toFixed(1)}s</small></p>
<div class="row">${audioCell('original', sample.sourceFilename)}${cells.join('')}</div></article>`;
    })
    .join('\n');
  await writeFile(
    path.join(directory, 'listen.html'),
    `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audio cleanup comparison</title>
<style>body{font:16px/1.5 system-ui;max-width:1200px;margin:40px auto;padding:0 20px;background:#fafafa;color:#222}article{border-top:1px solid #ccc;padding:16px 0}h2{font-size:18px;margin:0}h3{font-size:14px;margin:4px 0}small{color:#555}.row{display:grid;grid-template-columns:repeat(${CLEANERS.length + 1},1fr);gap:16px}audio{width:100%}</style>
<h1>Audio cleanup comparison</h1><p>${samples.length} samples · ${totals}</p>
${entries}</html>\n`,
  );
}

async function main(): Promise<void> {
  if (values.help || positionals.length === 0) {
    console.log(`Compare fal audio cleanup models on local files. Writes a listen.html page.

pnpm compare-audio-cleanup [--out <dir>] [--max-seconds 60] <file-or-directory>...

--out <directory>    Output directory (default: generated-speech/audio-cleanup)
--max-seconds <n>    Trim inputs to this many seconds, like the clone route (default: 60)
--env-file <file>    Load a dotenv file; repeat to load multiple files
--dry-run            List inputs and estimated cost without calling fal

Directories are scanned recursively. Existing outputs are reused.
Models: ${CLEANERS.map((cleaner) => cleaner.model).join(', ')}
Requires FAL_KEY, ffmpeg, and ffprobe.`);
    return;
  }

  const maxSeconds = Number(values['max-seconds']);
  if (!(maxSeconds > 0)) throw new Error('--max-seconds must be positive');
  const files = await collectAudioFiles(positionals);
  if (files.length === 0) throw new Error('No audio files found');

  const estimates = files.map((file) => ({
    durationSeconds: Math.min(probeDuration(file), maxSeconds),
    file,
  }));
  for (const { durationSeconds, file } of estimates)
    console.log(`${durationSeconds.toFixed(1).padStart(6)}s  ${file}`);
  for (const cleaner of CLEANERS) {
    const cost = estimates.reduce(
      (sum, estimate) => sum + cleaner.dollarCost(estimate.durationSeconds),
      0,
    );
    console.log(`Estimated ${cleaner.id}: $${cost.toFixed(4)}`);
  }
  if (values['dry-run']) return;

  loadScriptEnv(values['env-file']);
  if (!process.env.FAL_KEY) throw new Error('Missing FAL_KEY');
  fal.config({ credentials: process.env.FAL_KEY });

  const output = path.resolve(values.out);
  await mkdir(output, { recursive: true });

  const slugs = new Set<string>();
  const samples: SampleResult[] = [];
  for (const { durationSeconds, file } of estimates) {
    let slug = slugify(file) || 'sample';
    for (let index = 2; slugs.has(slug); index++)
      slug = `${slugify(file)}-${index}`;
    slugs.add(slug);

    const sourceFilename = `${slug}.original.wav`;
    const sourcePath = path.join(output, sourceFilename);
    if (!(await exists(sourcePath)))
      run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-i',
        file,
        '-vn',
        '-t',
        String(maxSeconds),
        sourcePath,
      ]);

    console.log(`Cleaning ${slug}`);
    const results = await Promise.all(
      CLEANERS.map((cleaner) =>
        cleanSample(
          cleaner,
          sourcePath,
          path.join(output, `${slug}.${cleaner.id}.${cleaner.extension}`),
          durationSeconds,
        ),
      ),
    );
    for (const result of results)
      console.log(
        `  ${result.cleaner}: ${result.error ?? `ok${result.seconds ? ` in ${result.seconds.toFixed(1)}s` : ' (cached)'}`}`,
      );
    samples.push({
      durationSeconds,
      input: file,
      results,
      slug,
      sourceFilename,
    });
    await writeFile(
      path.join(output, 'results.json'),
      `${JSON.stringify(samples, null, 2)}\n`,
    );
    await writeListeningPage(output, samples);
  }

  console.log(`Open ${path.join(output, 'listen.html')}`);
}

await main();
