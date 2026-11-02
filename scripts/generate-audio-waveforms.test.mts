// biome-ignore-all lint/style/noDoneCallback: node:test callbacks receive TestContext, not a done callback.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: Shared assertion helpers run synchronously inside node:test cases.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';

type Asset = Record<string, unknown> & {
  durationSeconds?: number;
  sha256?: string;
  waveform?: { sourceSha256: string; peaks: number[][] };
};
type Manifest = Record<string, unknown> & { assets: Record<string, Asset> };

function cli(args: string[], cwd: string, path = process.env.PATH) {
  return spawnSync(
    process.execPath,
    [join(import.meta.dirname, 'generate-audio-waveforms.mts'), ...args],
    {
      cwd,
      encoding: 'utf8',
      env: { PATH: path },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
}

function directory(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'generate-audio-waveforms-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function setup(t: TestContext, assets: Manifest['assets'] = {}) {
  const root = directory(t);
  const audio = join(root, 'source audio');
  mkdirSync(audio);
  const manifest = join(root, 'manifest.json');
  const original: Manifest = {
    model: 'synthetic-test-model',
    requests: [{ voice: 'test', options: { speed: 1 } }],
    sourceHashes: { reference: 'preserve-this-hash' },
    assets,
  };
  function write(value: unknown) {
    writeFileSync(manifest, `${JSON.stringify(value, null, 2)}\n`);
  }
  write(original);
  return {
    root,
    audio,
    manifest,
    original,
    write,
    read: () => JSON.parse(readFileSync(manifest, 'utf8')) as Manifest,
    run: (args: string[] = [], path = process.env.PATH) =>
      cli(['--manifest', manifest, '--audio-dir', audio, ...args], root, path),
  };
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function snapshot(path: string) {
  return { bytes: readFileSync(path), mtimeMs: statSync(path).mtimeMs };
}

function unchanged(path: string, before: ReturnType<typeof snapshot>) {
  assert.deepEqual(readFileSync(path), before.bytes);
  assert.equal(statSync(path).mtimeMs, before.mtimeMs);
}

function success(result: ReturnType<typeof cli>) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

function failure(result: ReturnType<typeof cli>, message: RegExp) {
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, message);
}

function waveform(asset: Asset, input: string, points: number, channels = 1) {
  assert.equal(asset.sha256, hash(input));
  assert.ok(
    typeof asset.durationSeconds === 'number' &&
      Number.isFinite(asset.durationSeconds) &&
      asset.durationSeconds > 0,
  );
  assert.ok(asset.waveform);
  assert.equal(asset.waveform.sourceSha256, hash(input));
  assert.equal(asset.waveform.peaks.length, channels);
  for (const channel of asset.waveform.peaks) {
    assert.equal(channel.length, points);
    assert.ok(
      channel.every(
        (value) => Number.isFinite(value) && value >= -1 && value <= 1,
      ),
    );
  }
  return asset.waveform.peaks;
}

const unavailable = ['ffmpeg', 'ffprobe'].filter(
  (tool) => spawnSync(tool, ['-version'], { timeout: 5000 }).status !== 0,
);
const integration = {
  skip: unavailable.length
    ? `Missing audio tools: ${unavailable.join(', ')}`
    : false,
  timeout: 60_000,
};

function fixture(
  path: string,
  filter = 'sine=frequency=440:sample_rate=44100:duration=0.2',
) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-v',
      'error',
      '-nostdin',
      '-y',
      '-f',
      'lavfi',
      '-i',
      filter,
      path,
    ],
    { encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

test('help documents the local CLI without requiring tools or a manifest', (t) => {
  const root = directory(t);
  const result = cli(['--help'], root, root);
  success(result);
  for (const option of ['manifest', 'audio-dir', 'points', 'force', 'help']) {
    assert.ok(result.stdout.includes(`--${option}`));
  }
  assert.match(result.stdout, /256/);
  assert.match(result.stdout, /4096/);
  assert.deepEqual(readdirSync(root), []);
});

for (const args of [
  ['--unknown'],
  ['--manifest'],
  ['--audio-dir'],
  ['--points'],
  ...['0', '-1', '4097', '1.5', 'NaN', 'Infinity', 'nope', ''].map((points) => [
    `--points=${points}`,
  ]),
]) {
  test(`rejects invalid options ${JSON.stringify(args)} without writes`, (t) => {
    const env = setup(t, { 'existing.wav': { keep: 'untouched' } });
    const before = snapshot(env.manifest);
    failure(
      env.run(args, env.root),
      /Unknown option|argument|integer from 1 to 4096/i,
    );
    unchanged(env.manifest, before);
    assert.deepEqual(readdirSync(env.audio), []);
  });
}

for (const value of [null, [], {}, { assets: [] }, { assets: null }]) {
  test(`rejects invalid manifest ${JSON.stringify(value)}`, (t) => {
    const env = setup(t);
    env.write(value);
    const before = snapshot(env.manifest);
    failure(env.run([], env.root), /assets object/);
    unchanged(env.manifest, before);
  });
}

test('requires an existing JSON manifest', (t) => {
  const env = setup(t);
  writeFileSync(env.manifest, '{invalid JSON');
  const before = snapshot(env.manifest);
  failure(env.run([], env.root), /JSON|property name/i);
  unchanged(env.manifest, before);
  rmSync(env.manifest);
  failure(env.run([], env.root), /ENOENT/);
  assert.deepEqual(readdirSync(env.root), ['source audio']);
});

test('rejects an empty selection without rewriting the manifest', (t) => {
  const env = setup(t);
  const before = snapshot(env.manifest);
  failure(env.run([], env.root), /No audio files selected/);
  unchanged(env.manifest, before);
});

test('rejects missing files and duplicate basenames before processing any input', (t) => {
  const env = setup(t, { 'first.wav': { keep: true } });
  const first = join(env.audio, 'first.wav');
  writeFileSync(
    first,
    'synthetic bytes; validation must not invoke audio tools',
  );
  const other = join(env.root, 'other');
  mkdirSync(other);
  const duplicate = join(other, 'first.wav');
  writeFileSync(duplicate, 'different synthetic bytes');
  const before = snapshot(env.manifest);
  const audioBefore = snapshot(first);
  for (const [args, message] of [
    [[first, join(env.audio, 'missing.wav')], /ENOENT/],
    [[first, duplicate], /Duplicate asset filename/],
    [[first, first], /Duplicate asset filename/],
    [[first, env.audio], /Expected an audio file/],
  ] as const) {
    failure(env.run([...args], env.root), message);
    unchanged(env.manifest, before);
    unchanged(first, audioBefore);
  }
  env.write({
    ...env.original,
    assets: { 'first.wav': {}, 'missing.wav': {} },
  });
  const allBefore = snapshot(env.manifest);
  failure(env.run([], env.root), /ENOENT/);
  unchanged(env.manifest, allBefore);
});

test('skips valid cached peaks without FFmpeg on PATH and leaves JSON and mtime intact', (t) => {
  const env = setup(t);
  const input = join(env.audio, 'cached.wav');
  writeFileSync(input, 'synthetic cache input; no decoding should occur');
  env.write({
    ...env.original,
    assets: {
      'cached.wav': {
        durationSeconds: 0.2,
        sha256: hash(input),
        waveform: {
          sourceSha256: hash(input),
          peaks: [
            [-1, 0, 1],
            [1, 0, -1],
          ],
        },
      },
    },
  });
  utimesSync(env.manifest, 1_000_000_000, 1_000_000_000);
  const before = snapshot(env.manifest);
  const audioBefore = snapshot(input);
  const result = env.run(['--points', '3'], env.root);
  success(result);
  assert.match(result.stdout, /unchanged/);
  unchanged(env.manifest, before);
  unchanged(input, audioBefore);
  failure(env.run(['--points', '3', '--force'], env.root), /ffprobe.*PATH/s);
  unchanged(env.manifest, before);
});

test(
  'processes all manifest assets at 256 points and preserves metadata and audio bytes',
  integration,
  (t) => {
    const env = setup(t, {
      'mono audio.wav': { request: 'mono', nested: { keep: [1, 2] } },
      'stereo.wav': { request: 'stereo', custom: false },
    });
    const mono = join(env.audio, 'mono audio.wav');
    const stereo = join(env.audio, 'stereo.wav');
    fixture(mono);
    fixture(
      stereo,
      'aevalsrc=0.2*sin(2*PI*440*t)|0.7*sin(2*PI*660*t):s=44100:d=0.2',
    );
    const before = [snapshot(mono), snapshot(stereo)];
    success(env.run());
    const result = env.read();
    for (const key of ['model', 'requests', 'sourceHashes']) {
      assert.deepEqual(result[key], env.original[key]);
    }
    for (const [name, metadata] of Object.entries(env.original.assets)) {
      for (const [key, value] of Object.entries(metadata)) {
        assert.deepEqual(result.assets[name][key], value);
      }
    }
    const monoPeaks = waveform(result.assets['mono audio.wav'], mono, 256);
    const stereoPeaks = waveform(result.assets['stereo.wav'], stereo, 256, 2);
    for (const channel of [...monoPeaks, ...stereoPeaks]) {
      assert.ok(channel.some((value) => value > 0));
      assert.ok(channel.some((value) => value < 0));
    }
    assert.ok(
      Math.max(...stereoPeaks[1].map(Math.abs)) >
        Math.max(...stereoPeaks[0].map(Math.abs)) * 2,
    );
    assert.ok(
      Math.abs((result.assets['stereo.wav'].durationSeconds as number) - 0.2) <
        0.01,
    );
    unchanged(mono, before[0]);
    unchanged(stereo, before[1]);
    utimesSync(env.manifest, 1_000_000_000, 1_000_000_000);
    const generated = snapshot(env.manifest);
    success(env.run());
    unchanged(env.manifest, generated);
    assert.deepEqual(readdirSync(env.root).sort(), [
      'manifest.json',
      'source audio',
    ]);
  },
);

test(
  'explicit files update basename entries, preserve unselected assets, and add future files',
  integration,
  (t) => {
    const env = setup(t, {
      'selected.wav': { custom: { preserve: true } },
      'unselected.wav': {
        sha256: 'keep',
        waveform: { sourceSha256: 'keep', peaks: [[0]] },
      },
    });
    const selected = join(env.root, 'selected.wav');
    fixture(selected);
    const selectedBefore = snapshot(selected);
    success(env.run(['--points', '1', 'selected.wav']));
    let result = env.read();
    waveform(result.assets['selected.wav'], selected, 1);
    assert.deepEqual(result.assets['selected.wav'].custom, { preserve: true });
    assert.deepEqual(
      result.assets['unselected.wav'],
      env.original.assets['unselected.wav'],
    );
    const future = join(env.root, 'future audio.wav');
    fixture(future);
    const futureBefore = snapshot(future);
    const selectedAsset = result.assets['selected.wav'];
    success(env.run(['--points', '4096', future]));
    result = env.read();
    waveform(result.assets['future audio.wav'], future, 4096);
    assert.deepEqual(result.assets['selected.wav'], selectedAsset);
    assert.deepEqual(
      result.assets['unselected.wav'],
      env.original.assets['unselected.wav'],
    );
    unchanged(selected, selectedBefore);
    unchanged(future, futureBefore);
  },
);

test(
  'regenerates changed audio even when asset sha256 is already updated but waveform source is stale',
  integration,
  (t) => {
    const env = setup(t, { 'changing.wav': { keep: true } });
    const input = join(env.audio, 'changing.wav');
    fixture(input);
    success(env.run(['--points', '8']));
    for (const updateAssetHash of [false, true]) {
      const previous = env.read();
      const oldWaveform = previous.assets['changing.wav'].waveform;
      fixture(
        input,
        `sine=frequency=${updateAssetHash ? 990 : 660}:sample_rate=44100:duration=0.3`,
      );
      const audioBefore = snapshot(input);
      assert.notEqual(hash(input), oldWaveform?.sourceSha256);
      if (updateAssetHash) {
        previous.assets['changing.wav'].sha256 = hash(input);
        env.write(previous);
      }
      success(env.run(['--points', '8']));
      const asset = env.read().assets['changing.wav'];
      waveform(asset, input, 8);
      assert.equal(asset.keep, true);
      assert.notDeepEqual(asset.waveform, oldWaveform);
      unchanged(input, audioBefore);
    }
  },
);

test(
  'regenerates changed point counts and honors --force for current waveforms',
  integration,
  (t) => {
    const env = setup(t, { 'mono.wav': {} });
    const input = join(env.audio, 'mono.wav');
    fixture(input);
    const audioBefore = snapshot(input);
    success(env.run(['--points', '4']));
    success(env.run(['--points', '9']));
    waveform(env.read().assets['mono.wav'], input, 9);
    utimesSync(env.manifest, 1_000_000_000, 1_000_000_000);
    const before = snapshot(env.manifest);
    const forced = env.run(['--points', '9', '--force']);
    success(forced);
    assert.match(forced.stdout, /generated/);
    assert.notEqual(statSync(env.manifest).mtimeMs, before.mtimeMs);
    assert.deepEqual(readFileSync(env.manifest), before.bytes);
    waveform(env.read().assets['mono.wav'], input, 9);
    unchanged(input, audioBefore);
  },
);

test(
  'regenerates malformed or stale cache metadata instead of accepting it',
  integration,
  (t) => {
    const env = setup(t, { 'mono.wav': { keep: 'metadata' } });
    const input = join(env.audio, 'mono.wav');
    fixture(input);
    const audioBefore = snapshot(input);
    const sha = hash(input);
    const validWaveform = { sourceSha256: sha, peaks: [[0, 0, 0]] };
    const invalid: Record<string, unknown>[] = [
      { sha256: 'stale' },
      { durationSeconds: 0 },
      { durationSeconds: null },
      { durationSeconds: -1 },
      { waveform: undefined },
      { waveform: null },
      { waveform: { ...validWaveform, sourceSha256: 'stale' } },
      { waveform: { sourceSha256: sha, peaks: [] } },
      {
        waveform: {
          sourceSha256: sha,
          peaks: Array.from({ length: 9 }, () => [0, 0, 0]),
        },
      },
      { waveform: { sourceSha256: sha, peaks: [0, 0, 0] } },
      { waveform: { sourceSha256: sha, peaks: [[0, 0]] } },
      { waveform: { sourceSha256: sha, peaks: [[0, 0, 0], [0]] } },
      ...[1.01, -1.01, null, '0'].map((value) => ({
        waveform: { sourceSha256: sha, peaks: [[0, value, 0]] },
      })),
    ];
    for (const patch of invalid) {
      env.write({
        ...env.original,
        assets: {
          'mono.wav': {
            keep: 'metadata',
            durationSeconds: 0.2,
            sha256: sha,
            waveform: validWaveform,
            ...patch,
          },
        },
      });
      const result = env.run(['--points', '3']);
      success(result);
      assert.match(result.stdout, /generated/, JSON.stringify(patch));
      const asset = env.read().assets['mono.wav'];
      waveform(asset, input, 3);
      assert.equal(asset.keep, 'metadata');
      unchanged(input, audioBefore);
    }
  },
);

test(
  'a corrupt second input leaves the entire manifest and both audio inputs untouched',
  integration,
  (t) => {
    const env = setup(t, {
      'first.wav': { keep: 1 },
      'corrupt.wav': { keep: 2 },
    });
    const first = join(env.audio, 'first.wav');
    const corrupt = join(env.audio, 'corrupt.wav');
    fixture(first);
    writeFileSync(corrupt, 'synthetic corrupt audio');
    const before = snapshot(env.manifest);
    const inputs = [snapshot(first), snapshot(corrupt)];
    const result = env.run(['--points', '4']);
    failure(result, /ffprobe.*corrupt\.wav/s);
    assert.match(result.stdout, /first\.wav: generated/);
    unchanged(env.manifest, before);
    unchanged(first, inputs[0]);
    unchanged(corrupt, inputs[1]);
    assert.deepEqual(readdirSync(env.root).sort(), [
      'manifest.json',
      'source audio',
    ]);
  },
);
