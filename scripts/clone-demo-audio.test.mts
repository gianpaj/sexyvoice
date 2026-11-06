import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';

import { normalizeCloneDemoAudio } from './lib/clone-demo-audio.mts';

const unavailable = ['ffmpeg', 'ffprobe'].filter(
  (tool) =>
    spawnSync(tool, ['-version'], { timeout: 5000, encoding: 'utf8' })
      .status !== 0,
);
const options = {
  skip: unavailable.length
    ? `Missing audio tools: ${unavailable.join(', ')}`
    : false,
  timeout: 60_000,
};

function run(tool: string, args: string[]): string {
  const result = spawnSync(tool, args, {
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${tool} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return `${result.stdout}\n${result.stderr}`;
}

function directory(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'clone-demo-audio-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function fixture(path: string, filter: string, volume = '1'): void {
  run('ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-v',
    'error',
    '-n',
    '-f',
    'lavfi',
    '-i',
    filter,
    '-af',
    `volume=${volume}`,
    path,
  ]);
}

function probe(path: string) {
  return JSON.parse(
    run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_name,bit_rate',
      '-of',
      'json',
      path,
    ]),
  ) as {
    format: { duration: string };
    streams: { codec_name: string; bit_rate: string }[];
  };
}

for (const sample of [
  { name: 'quiet WAV', extension: 'wav', volume: '0.08', duration: 15.25 },
  { name: 'loud MP3', extension: 'mp3', volume: '4', duration: 17.5 },
  {
    name: 'varying-level WAV requiring dynamic fallback correction',
    extension: 'wav',
    volume: "'if(lt(mod(t,4),0.1),2,if(lt(mod(t,4),2),0.5,0.2))':eval=frame",
    duration: 15.25,
  },
  {
    name: 'strong transient WAV requiring PCM correction',
    extension: 'wav',
    volume: "'if(lt(mod(t,4),0.1),6,if(lt(mod(t,4),2),0.5,0.05))':eval=frame",
    duration: 15.25,
  },
]) {
  test(
    `normalizes ${sample.name} to 128 kbps MP3 without trimming or changing input`,
    options,
    (t) => {
      const path = directory(t);
      const source = join(path, `source audio.${sample.extension}`);
      const destination = join(path, 'normalized audio.mp3');
      fixture(
        source,
        `sine=frequency=523:sample_rate=44100:duration=${sample.duration}`,
        sample.volume,
      );
      const original = readFileSync(source);
      const sourceDuration = Number(probe(source).format.duration);

      assert.equal(normalizeCloneDemoAudio(source, destination), undefined);

      assert.deepEqual(readFileSync(source), original);
      const metadata = probe(destination);
      const duration = Number(metadata.format.duration);
      assert.ok(duration > 12, `Audio was truncated to ${duration}s`);
      assert.ok(
        Math.abs(duration - sourceDuration) < 0.1,
        `Duration changed from ${sourceDuration}s to ${duration}s`,
      );
      assert.equal(metadata.streams[0].codec_name, 'mp3');
      assert.equal(Number(metadata.streams[0].bit_rate), 128_000);
      const report = run('ffmpeg', [
        '-hide_banner',
        '-nostdin',
        '-nostats',
        '-i',
        destination,
        '-af',
        'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
        '-f',
        'null',
        '-',
      ]);
      const measurement = JSON.parse(
        report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1),
      ) as {
        input_i: string;
        input_tp: string;
      };
      const loudness = Number(measurement.input_i);
      const truePeak = Number(measurement.input_tp);
      assert.ok(Math.abs(loudness + 14) <= 0.5, `${loudness} LUFS`);
      assert.ok(truePeak <= -1.5, `${truePeak} dBTP exceeds the ceiling`);
    },
  );
}

test('rejects silence without publishing an output', options, (t) => {
  const path = directory(t);
  const source = join(path, 'silence.wav');
  const destination = join(path, 'normalized.mp3');
  fixture(source, 'anullsrc=r=48000:cl=mono:d=15');
  const original = readFileSync(source);

  assert.throws(
    () => normalizeCloneDemoAudio(source, destination),
    /Cannot normalize .*invalid loudnorm.*silent or unmeasurable/,
  );
  assert.equal(existsSync(destination), false);
  assert.deepEqual(readFileSync(source), original);
});

test('rejects a remaining target miss after four encodes', options, (t) => {
  const path = directory(t);
  const source = join(path, 'sparse-peaks.wav');
  const destination = join(path, 'normalized.mp3');
  fixture(
    source,
    'sine=frequency=523:sample_rate=44100:duration=15.25',
    "'if(lt(mod(t,4),0.025),6,0.0001)':eval=frame",
  );
  const original = readFileSync(source);

  assert.throws(
    () => normalizeCloneDemoAudio(source, destination),
    /Cannot normalize .*after 4 encodes:.*required -14 ±0.5 LUFS/,
  );
  assert.equal(existsSync(destination), false);
  assert.deepEqual(readFileSync(source), original);
});

test('reports FFmpeg failures for missing or invalid audio', options, (t) => {
  const path = directory(t);
  const destination = join(path, 'normalized.mp3');
  const invalid = join(path, 'invalid.wav');
  writeFileSync(invalid, 'not audio');

  for (const source of [join(path, 'missing.wav'), invalid]) {
    assert.throws(
      () => normalizeCloneDemoAudio(source, destination),
      /FFmpeg loudness measurement of .* failed/,
    );
    assert.equal(existsSync(destination), false);
  }
  assert.equal(readFileSync(invalid, 'utf8'), 'not audio');
});

test(
  'refuses to overwrite existing files or the source itself',
  options,
  (t) => {
    const path = directory(t);
    const source = join(path, 'source.wav');
    const destination = join(path, 'existing.mp3');
    fixture(source, 'sine=duration=15');
    const original = readFileSync(source);
    writeFileSync(destination, 'keep this output');

    for (const target of [destination, source]) {
      assert.throws(
        () => normalizeCloneDemoAudio(source, target),
        /Refusing to overwrite audio/,
      );
    }
    assert.equal(readFileSync(destination, 'utf8'), 'keep this output');
    assert.deepEqual(readFileSync(source), original);
  },
);

test('does not follow a dangling destination symlink', options, (t) => {
  const path = directory(t);
  const source = join(path, 'source.wav');
  const destination = join(path, 'symlink.mp3');
  const target = join(path, 'missing.mp3');
  fixture(source, 'sine=duration=15');
  symlinkSync(target, destination);

  assert.throws(() => normalizeCloneDemoAudio(source, destination), /EEXIST/);
  assert.equal(existsSync(target), false);
});
