import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { runAudioTool } from './ffmpeg.mts';

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

  const task = `for ${JSON.stringify(input)}`;
  const { stdout: metadata } = runAudioTool(
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
    { task, timeoutMs: 10_000 },
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

  const { stdout: pcm } = runAudioTool(
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
    { maxBuffer: PCM_MAX_BUFFER, task },
  );
  return {
    durationSeconds,
    peaks: extractWaveformPeaks(pcm, channels, points),
  };
}
