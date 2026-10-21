import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import {
  planR2FileUploads,
  sha256,
  uploadR2File,
} from './lib/r2-file-upload.mts';

const bytes = Buffer.from('any file contents');

async function fixture(
  run: (directory: string) => Promise<void> | void,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'r2-file-upload-'));
  try {
    await writeFile(path.join(directory, 'data.bin'), bytes);
    await writeFile(path.join(directory, 'notes #1.txt'), 'hello');
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function cli(directory: string, args: string[]) {
  return spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, 'upload-r2-files.mts'), ...args],
    {
      cwd: directory,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    },
  );
}

function client(send: (command: unknown) => unknown): Pick<S3Client, 'send'> {
  return {
    send: (command: unknown) => Promise.resolve().then(() => send(command)),
  } as Pick<S3Client, 'send'>;
}

const matchingHead = {
  ContentLength: bytes.length,
  ContentType: 'application/octet-stream',
  Metadata: { sha256: sha256(bytes) },
};

test('plans arbitrary files with basenames, hashes, and encoded public URLs', async () =>
  fixture(async (directory) => {
    const targets = await planR2FileUploads(
      [path.join(directory, 'data.bin'), path.join(directory, 'notes #1.txt')],
      'demo-clones/voxtral-3/',
      'https://files.sexyvoice.ai',
    );
    assert.deepEqual(
      targets.map(({ key }) => key),
      ['demo-clones/voxtral-3/data.bin', 'demo-clones/voxtral-3/notes #1.txt'],
    );
    assert.equal(targets[0].sha256, sha256(bytes));
    assert.equal(
      targets[1].publicUrl,
      'https://files.sexyvoice.ai/demo-clones/voxtral-3/notes%20%231.txt',
    );
    assert.equal(
      (await planR2FileUploads([targets[0].path], ''))[0].key,
      'data.bin',
    );
  }));

test('rejects missing files, directories, symlinks, duplicate destinations, and unsafe prefixes', async () =>
  fixture(async (directory) => {
    const file = path.join(directory, 'data.bin');
    await mkdir(path.join(directory, 'other'));
    const duplicate = path.join(directory, 'other/data.bin');
    await writeFile(duplicate, bytes);
    const link = path.join(directory, 'link.bin');
    await symlink(file, link);
    await assert.rejects(planR2FileUploads([], ''), /at least one/);
    await assert.rejects(
      planR2FileUploads([path.join(directory, 'missing')], ''),
      /ENOENT/,
    );
    await assert.rejects(planR2FileUploads([directory], ''), /regular file/);
    await assert.rejects(planR2FileUploads([link], ''), /regular file/);
    await assert.rejects(
      planR2FileUploads([file, duplicate], ''),
      /Duplicate destination/,
    );
    await assert.rejects(planR2FileUploads([file], '../bad'), /Prefix/);
    await assert.rejects(
      planR2FileUploads([file], 'demo', 'https://files.sexyvoice.ai/path'),
      /HTTPS origin/,
    );
  }));

test('CLI dry run accepts multiple arbitrary files without credentials or a manifest', async () =>
  fixture((directory) => {
    const result = cli(directory, [
      '--bucket',
      'sv-audio-files',
      '--prefix',
      'demo-clones/voxtral-3',
      '--dry-run',
      'data.bin',
      'notes #1.txt',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /sv-audio-files\/demo-clones\/voxtral-3\/data.bin/,
    );
    assert.match(
      result.stdout,
      /sv-audio-files\/demo-clones\/voxtral-3\/notes #1.txt/,
    );
    assert.match(result.stdout, /Dry run: 2 files; no network requests/);
  }));

test('CLI uploads by default and requires credentials rather than an upload flag', async () =>
  fixture((directory) => {
    const result = cli(directory, ['--bucket', 'sv-audio-files', 'data.bin']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing env.R2_ACCESS_KEY_ID/);
    assert.doesNotMatch(result.stdout, /Dry run/);
    const missing = cli(directory, ['--dry-run', 'data.bin']);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /--bucket is required/);
  }));

test('shared uploader supports private binary objects and preserves the requested content type', async () => {
  const commands: unknown[] = [];
  await uploadR2File({
    bucket: 'private-files',
    key: 'data.bin',
    bytes,
    contentType: 'application/octet-stream',
    client: client((command) => {
      commands.push(command);
      if (command instanceof PutObjectCommand) {
        assert.equal(command.input.ContentType, 'application/octet-stream');
        assert.equal(command.input.IfNoneMatch, '*');
        assert.equal(command.input.Metadata?.sha256, sha256(bytes));
        return {};
      }
      assert.ok(command instanceof HeadObjectCommand);
      return matchingHead;
    }),
    fetchPublic: (() =>
      Promise.reject(
        new Error('Must not fetch a private file'),
      )) as typeof fetch,
  });
  assert.equal(commands.length, 2);
});

test('shared uploader verifies public binary downloads and rejects existing different content', async () => {
  const existing = client((command) => {
    if (command instanceof PutObjectCommand)
      throw Object.assign(new Error('PreconditionFailed'), {
        $metadata: { httpStatusCode: 412 },
      });
    return matchingHead;
  });
  const options = {
    bucket: 'files',
    key: 'data.bin',
    bytes,
    contentType: 'application/octet-stream',
    client: existing,
    publicUrl: 'https://files.sexyvoice.ai/data.bin',
  };
  await uploadR2File({
    ...options,
    fetchPublic: (async () =>
      new Response(bytes, {
        headers: { 'content-type': 'application/octet-stream' },
      })) as typeof fetch,
  });
  await assert.rejects(
    uploadR2File({
      ...options,
      fetchPublic: (async () =>
        new Response('different', {
          headers: { 'content-type': 'application/octet-stream' },
        })) as typeof fetch,
    }),
    /hash differs/,
  );
  await assert.rejects(
    uploadR2File({
      ...options,
      client: client((command) =>
        command instanceof HeadObjectCommand
          ? { ...matchingHead, Metadata: { sha256: 'different' } }
          : {},
      ),
    }),
    /does not match/,
  );
});
