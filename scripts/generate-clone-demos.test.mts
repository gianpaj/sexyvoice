import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

import cloneDemoConfig from '../apps/web/data/clone-demo-config.ts';

const { CLONE_DEMO_TAKES, CLONE_DEMO_VOICES } = cloneDemoConfig;

function cli(args: string[]) {
  return spawnSync(
    process.execPath,
    [join(import.meta.dirname, 'generate-clone-demos.mts'), ...args],
    {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
      timeout: 10_000,
    },
  );
}

test('lists the configured voices and takes in the help', () => {
  const result = cli(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.stdout.includes(
      `--voice ${CLONE_DEMO_VOICES.map((voice) => voice.id).join('|')}`,
    ),
  );
  assert.ok(
    result.stdout.includes(
      `--take ${CLONE_DEMO_TAKES.map((take) => take.id).join('|')}`,
    ),
  );
});

test('rejects unknown voices before loading credentials or creating output', () => {
  const result = cli(['--voice', 'unknown']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown voice: unknown/);
});

test('rejects unsupported voice and take pairs before generation', () => {
  const result = cli(['--voice', 'heike', '--take', 'sameOriginal']);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Unsupported demo selection: heike\/sameOriginal/,
  );
});

test('rejects unknown takes before loading credentials or creating output', () => {
  const result = cli(['--take', 'unknown']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown take: unknown/);
});
