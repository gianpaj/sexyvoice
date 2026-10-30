import { spawnSync } from 'node:child_process';
import {
  constants,
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOUDNORM = 'loudnorm=I=-14:TP=-1.5:LRA=11';
const MAX_ENCODINGS = 4;

function ffmpeg(args: string[], stage: string): string {
  const result = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostdin', '-nostats', '-n', ...args],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `FFmpeg ${stage} failed (${result.error?.message ?? `exit ${result.status}, signal ${result.signal}`}): ${result.stderr ?? ''}`,
      { cause: result.error },
    );
  }
  return `${result.stdout}\n${result.stderr}`;
}

function measure(source: string) {
  const output = ffmpeg(
    [
      '-i',
      source,
      '-map',
      '0:a:0',
      '-af',
      `${LOUDNORM}:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    `loudness measurement of ${source}`,
  );
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(output.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? '');
  } catch (cause) {
    throw new Error(`Invalid FFmpeg loudnorm JSON for ${source}`, { cause });
  }
  function number(field: string): number {
    const raw = report[field];
    const value =
      typeof raw === 'string' && raw.trim() ? Number(raw) : Number.NaN;
    if (!Number.isFinite(value)) {
      throw new Error(
        `Cannot normalize ${source}: invalid loudnorm ${field}=${String(raw)} (audio may be silent or unmeasurable)`,
      );
    }
    return value;
  }
  return {
    i: number('input_i'),
    tp: number('input_tp'),
    lra: number('input_lra'),
    thresh: number('input_thresh'),
    offset: number('target_offset'),
  };
}

/**
 * Apply measured loudnorm, then at most three measured PCM gain/limiter
 * corrections. Every encode reads the original; publish only a verified MP3.
 */
export function normalizeCloneDemoAudio(
  source: string,
  destination: string,
): void {
  if (existsSync(destination)) {
    throw new Error(`Refusing to overwrite audio: ${destination}`);
  }
  const measured = measure(source);
  const directory = mkdtempSync(join(tmpdir(), 'clone-demo-audio-'));
  try {
    let gain = 0;
    // Reserve 0.5 dB of PCM headroom for resampling and MP3 peak overshoot.
    let peak = -2;
    for (let attempt = 0; attempt < MAX_ENCODINGS; attempt++) {
      const output = join(directory, `normalized-${attempt}.mp3`);
      const correction =
        attempt === 0
          ? ''
          : `,aresample=192000,volume=${gain}dB,alimiter=limit=${10 ** (peak / 20)}:level=false:latency=true`;
      ffmpeg(
        [
          '-i',
          source,
          '-map',
          '0:a:0',
          '-af',
          `${LOUDNORM}:measured_I=${measured.i}:measured_TP=${measured.tp}:measured_LRA=${measured.lra}:measured_thresh=${measured.thresh}:offset=${measured.offset}:linear=true${correction}`,
          '-ar',
          '48000',
          '-codec:a',
          'libmp3lame',
          '-b:a',
          '128k',
          output,
        ],
        `normalization of ${source}`,
      );
      // Dynamic fallback and MP3 encoding can miss the measured target.
      const encoded = measure(output);
      if (Math.abs(encoded.i + 14) <= 0.5 && encoded.tp <= -1.5) {
        copyFileSync(output, destination, constants.COPYFILE_EXCL);
        return;
      }
      if (attempt === MAX_ENCODINGS - 1) {
        throw new Error(
          `Cannot normalize ${source} after ${MAX_ENCODINGS} encodes: encoded MP3 measures ${encoded.i} LUFS / ${encoded.tp} dBTP; required -14 ±0.5 LUFS and at most -1.5 dBTP`,
        );
      }
      // Loudnorm's dynamic offset can plateau; correct its PCM output instead.
      gain += -14 - encoded.i;
      if (attempt > 0 && encoded.tp > -1.5) peak -= encoded.tp + 1.5 + 0.1;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
