import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

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

test('documents single-voice and single-take generation', () => {
  const result = cli(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--voice kat\|heike/);
  assert.match(result.stdout, /--take natural\|sarcastic\|calmSlow/);
});

test('rejects unknown voices before loading credentials or creating output', () => {
  const result = cli(['--voice', 'unknown']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown voice: unknown/);
});

test('rejects unknown takes before loading credentials or creating output', () => {
  const result = cli(['--take', 'unknown']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown take: unknown/);
});
