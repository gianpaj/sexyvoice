import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  fileTimestamp,
  replaceJson,
  sha256,
  writeNewJson,
} from './lib/files.mts';

async function withDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scripts-files-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test('writes a new report once and refuses to overwrite it', () =>
  withDirectory(async (directory) => {
    const report = path.join(directory, 'nested', 'report.json');

    await writeNewJson(report, { ok: true });

    assert.equal(await readFile(report, 'utf8'), '{\n  "ok": true\n}\n');
    await assert.rejects(writeNewJson(report, { ok: false }), {
      code: 'EEXIST',
    });
  }));

test('replaces a JSON file without leaving temporary files', () =>
  withDirectory(async (directory) => {
    const manifest = path.join(directory, 'manifest.json');

    await replaceJson(manifest, { version: 1 });
    const bytes = await replaceJson(manifest, { version: 2 }, { mode: 0o600 });

    assert.equal(await readFile(manifest, 'utf8'), '{\n  "version": 2\n}\n');
    assert.equal(bytes, Buffer.byteLength('{\n  "version": 2\n}\n'));
    assert.equal((await stat(manifest)).mode % 0o1000, 0o600);
    assert.deepEqual(await readdir(directory), ['manifest.json']);
  }));

test('formats hashes and file timestamps', () => {
  assert.equal(
    sha256(Buffer.from('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    fileTimestamp(new Date('2026-11-06T10:20:30.456Z')),
    '2026-11-06T10-20-30-456Z',
  );
});
