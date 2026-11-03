import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_WAVEFORM_POINTS = 256;
const PCM_MAX_BUFFER = 64 * 1024 * 1024;

export function assertWaveformPoints(points: number): void {
  if (!Number.isInteger(points) || points < 1 || points > 4096) {
    throw new Error('Waveform points must be an integer from 1 to 4096.');
  }
}

function assertChannels(channels: number): void {
  if (!Number.isInteger(channels) || channels < 1 || channels > 8) {
    throw new Error('Audio must have between 1 and 8 channels.');
  }
}

export function extractWaveformPeaks(
  pcm: Buffer,
  channels: number,
  points: number,
): number[][] {
  assertWaveformPoints(points);
  assertChannels(channels);
  if (pcm.length === 0 || pcm.length % (4 * channels) !== 0) {
    throw new Error('Decoded PCM is empty or contains a partial audio frame.');
  }
  for (let offset = 0; offset < pcm.length; offset += 4) {
    if (!Number.isFinite(pcm.readFloatLE(offset))) {
      throw new Error('Decoded PCM contains a non-finite sample.');
    }
  }

  const frames = pcm.length / (4 * channels);
  let maximum = 1;
  const peaks = Array.from({ length: channels }, (_, channel) =>
    Array.from({ length: points }, (_, bin) => {
      const start = Math.floor((bin * frames) / points);
      const end = Math.ceil(((bin + 1) * frames) / points);
      let peak = 0;
      for (let frame = start; frame < end; frame++) {
        const sample = pcm.readFloatLE((frame * channels + channel) * 4);
        if (Math.abs(sample) > Math.abs(peak)) peak = sample;
      }
      maximum = Math.max(maximum, Math.abs(peak));
      return peak;
    }),
  );

  return peaks.map((channel) =>
    channel.map((peak) => Math.round((peak / maximum) * 10_000) / 10_000 || 0),
  );
}

function runAudioTool(
  tool: 'ffprobe' | 'ffmpeg',
  args: string[],
  path: string,
): Buffer {
  const timeout = tool === 'ffprobe' ? 10_000 : 120_000;
  const result = spawnSync(tool, args, {
    timeout,
    maxBuffer: tool === 'ffprobe' ? 1024 * 1024 : PCM_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
    let advice = 'Check that the input is a readable, valid local audio file.';
    if (code === 'ENOENT') {
      advice = `Install FFmpeg and ensure ${tool} is on PATH.`;
    } else if (code === 'ETIMEDOUT') {
      advice = `Processing exceeded ${timeout / 1000} seconds; use a shorter input.`;
    } else if (code === 'ENOBUFS') {
      advice =
        'Output exceeded the buffer limit (PCM: 64 MiB); use a shorter input.';
    }
    const detail = result.error?.message || result.stderr?.toString().trim();
    throw new Error(
      `${tool} failed for ${JSON.stringify(path)}: ${detail || `exit ${result.status}, signal ${result.signal}`}. ${advice}`,
      { cause: result.error },
    );
  }
  return result.stdout;
}

export function extractAudioWaveform(
  path: string,
  points = DEFAULT_WAVEFORM_POINTS,
): { durationSeconds: number; peaks: number[][] } {
  assertWaveformPoints(points);
  const input = resolve(path);
  try {
    if (!statSync(input).isFile())
      throw new Error('Input is not a regular file.');
  } catch (cause) {
    throw new Error(
      `Cannot read local audio ${JSON.stringify(path)}; provide an existing regular file.`,
      { cause },
    );
  }

  const metadata = runAudioTool(
    'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=channels:format=duration',
      '-of',
      'json',
      input,
    ],
    input,
  );
  let probe: {
    streams?: { channels?: number }[];
    format?: { duration?: string };
  };
  try {
    probe = JSON.parse(metadata.toString());
  } catch (cause) {
    throw new Error(
      `ffprobe returned invalid JSON for ${JSON.stringify(path)}.`,
      {
        cause,
      },
    );
  }
  const channels = probe?.streams?.[0]?.channels;
  if (channels === undefined) {
    throw new Error(
      `No first audio stream with channels in ${JSON.stringify(path)}.`,
    );
  }
  assertChannels(channels);
  const durationSeconds = Number(probe?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(
      `ffprobe reported an invalid duration for ${JSON.stringify(path)}.`,
    );
  }

  const pcm = runAudioTool(
    'ffmpeg',
    [
      '-hide_banner',
      '-v',
      'error',
      '-nostdin',
      '-xerror',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      input,
      '-map',
      '0:a:0',
      '-ar',
      '8000',
      '-ac',
      String(channels),
      '-c:a',
      'pcm_f32le',
      '-f',
      'f32le',
      'pipe:1',
    ],
    input,
  );
  return {
    durationSeconds,
    peaks: extractWaveformPeaks(pcm, channels, points),
  };
}
