import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';

import {
  assertWaveformPoints,
  DEFAULT_WAVEFORM_POINTS,
  extractAudioWaveform,
  extractWaveformPeaks,
} from './lib/audio-waveform-peaks.mts';

function pcm(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 4);
  for (const [index, sample] of samples.entries()) {
    buffer.writeFloatLE(sample, index * 4);
  }
  return buffer;
}

test('validates the default and point boundaries', () => {
  assert.equal(DEFAULT_WAVEFORM_POINTS, 256);
  for (const points of [1, 256, 4096]) {
    assert.equal(assertWaveformPoints(points), undefined);
  }
  for (const points of [
    0,
    -1,
    4097,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.throws(() => assertWaveformPoints(points), /integer from 1 to 4096/);
    assert.throws(() => extractWaveformPeaks(pcm([0]), 1, points), /points/);
    assert.throws(() => extractAudioWaveform('not-read.mp3', points), /points/);
  }
});

test('preserves signed transients and the first sample on equal magnitudes', () => {
  assert.deepEqual(
    extractWaveformPeaks(pcm([0.1, -0.9, 0.2, 0.8, -0.8, 0.1]), 1, 2),
    [[-0.9, 0.8]],
  );
});

test('uses floor starts and ceil ends for overlapping equal-time bins', () => {
  assert.deepEqual(
    extractWaveformPeaks(pcm([0.1, -0.9, 0.3, 0.8, 0.2]), 1, 3),
    [[-0.9, -0.9, 0.8]],
  );
});

test('deinterleaves channels without downmixing', () => {
  assert.deepEqual(
    extractWaveformPeaks(
      pcm([0.1, -0.8, 0.7, -0.2, -0.9, 0.3, 0.1, 0.6]),
      2,
      2,
    ),
    [
      [0.7, -0.9],
      [-0.8, 0.6],
    ],
  );
  const samples = [0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7, -0.8];
  assert.deepEqual(
    extractWaveformPeaks(pcm(samples), 8, 1),
    samples.map((v) => [v]),
  );
});

test('normalizes only over-range peaks using one global scale', () => {
  assert.deepEqual(extractWaveformPeaks(pcm([2, -4, -1, 2]), 2, 2), [
    [0.5, -0.25],
    [-1, 0.5],
  ]);
  assert.deepEqual(extractWaveformPeaks(pcm([0.123_456, -0.765_432]), 1, 2), [
    [0.1235, -0.7654],
  ]);
});

test('returns exactly the requested points for very short clips and silence', () => {
  assert.deepEqual(extractWaveformPeaks(pcm([-0.5, 0.25]), 2, 5), [
    [-0.5, -0.5, -0.5, -0.5, -0.5],
    [0.25, 0.25, 0.25, 0.25, 0.25],
  ]);
  assert.deepEqual(extractWaveformPeaks(pcm([0.2, -0.8]), 1, 5), [
    [0.2, 0.2, -0.8, -0.8, -0.8],
  ]);
  assert.deepEqual(extractWaveformPeaks(pcm([0, -0]), 2, 4096), [
    new Array(4096).fill(0),
    new Array(4096).fill(0),
  ]);
  assert.deepEqual(extractWaveformPeaks(pcm([-0.000_001]), 1, 1), [[0]]);
});

test('rejects invalid channels, empty or partial PCM, and non-finite samples', () => {
  for (const channels of [
    0,
    -1,
    1.5,
    9,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(
      () => extractWaveformPeaks(pcm([0]), channels, 1),
      /channels/,
    );
  }
  for (const buffer of [
    Buffer.alloc(0),
    Buffer.alloc(3),
    Buffer.alloc(5),
    pcm([0]),
  ]) {
    assert.throws(() => extractWaveformPeaks(buffer, 2, 1), /empty|partial/);
  }
  for (const sample of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.throws(
      () => extractWaveformPeaks(pcm([0.9, sample, 0.1, 0]), 2, 1),
      /non-finite/,
    );
  }
});

function directory(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'audio-waveform-peaks-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('rejects missing inputs, directories, and remote URLs as local paths', {}, (t) => {
  const path = directory(t);
  for (const input of [
    path,
    join(path, 'missing.mp3'),
    'https://example.com/a.mp3',
  ]) {
    assert.throws(() => extractAudioWaveform(input), /existing regular file/);
  }
});

const unavailable = ['ffmpeg', 'ffprobe'].filter(
  (tool) => spawnSync(tool, ['-version'], { timeout: 5000 }).status !== 0,
);
const integration = {
  skip: unavailable.length
    ? `Missing audio tools: ${unavailable.join(', ')}`
    : false,
  timeout: 30_000,
};

function fixture(path: string, filter: string): void {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-v',
      'error',
      '-nostdin',
      '-n',
      '-f',
      'lavfi',
      '-i',
      filter,
      path,
    ],
    { encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `FFmpeg fixture failed: ${result.error?.message || result.stderr}`,
    );
  }
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

for (const sample of [
  {
    name: 'mono',
    filter: 'sine=frequency=440:sample_rate=44100:duration=0.2',
    channels: 1,
  },
  {
    name: 'stereo',
    filter: 'aevalsrc=0.2*sin(2*PI*440*t)|0.7*sin(2*PI*660*t):s=44100:d=0.2',
    channels: 2,
  },
  { name: 'silence', filter: 'anullsrc=r=44100:cl=stereo:d=0.2', channels: 2 },
]) {
  test(
    `extracts ${sample.name} MP3 without changing the input`,
    integration,
    (t) => {
      const path = directory(t);
      const input = join(path, `${sample.name} audio.mp3`);
      fixture(input, sample.filter);
      const before = hash(input);
      const result = extractAudioWaveform(input);
      assert.ok(Number.isFinite(result.durationSeconds));
      assert.ok(result.durationSeconds >= 0.2 && result.durationSeconds < 0.5);
      assert.equal(result.peaks.length, sample.channels);
      for (const channel of result.peaks) {
        assert.equal(channel.length, DEFAULT_WAVEFORM_POINTS);
        assert.ok(
          channel.every(
            (value) => Number.isFinite(value) && Math.abs(value) <= 1,
          ),
        );
        if (sample.name === 'silence') {
          assert.ok(channel.every((value) => value === 0));
        } else {
          assert.ok(channel.some((value) => value > 0));
          assert.ok(channel.some((value) => value < 0));
        }
      }
      if (sample.name === 'stereo') {
        const maxima = result.peaks.map((channel) =>
          Math.max(...channel.map(Math.abs)),
        );
        assert.ok(maxima[1] > maxima[0] * 2);
      }
      assert.equal(extractAudioWaveform(input, 7).peaks[0].length, 7);
      assert.equal(hash(input), before);
      assert.deepEqual(readdirSync(path), [`${sample.name} audio.mp3`]);
    },
  );
}

test('rejects corrupt audio without changing it', integration, (t) => {
  const path = directory(t);
  const input = join(path, 'corrupt.mp3');
  writeFileSync(input, 'This is not an MP3.');
  const before = hash(input);
  assert.throws(
    () => extractAudioWaveform(input),
    /ffprobe failed.*valid local audio file/s,
  );
  assert.equal(hash(input), before);
  assert.deepEqual(readdirSync(path), ['corrupt.mp3']);
});
