import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { GetObjectCommand } from '@aws-sdk/client-s3';

import {
  parseBackupCliArgs,
  resolveBackupSources,
  runBackup,
  runDownloadEffects,
} from './backup-r2-audio.mts';
import { createR2Client, createR2ClientAdapter } from './lib/r2-client.mts';
import {
  downloadWithoutOverwrite,
  type R2Client,
  type R2ObjectMetadata,
  resolveLocalObjectPath,
} from './lib/r2-transfer.mts';

function object(
  key: string,
  overrides: Partial<R2ObjectMetadata> = {},
): R2ObjectMetadata {
  return {
    bucket: 'audio',
    etag: createHash('md5').update(key).digest('hex'),
    key,
    lastModified: '2026-01-01T00:00:00.000Z',
    prefix: '',
    size: Buffer.byteLength(key),
    ...overrides,
  };
}

async function* byteStream(...chunks: Uint8Array[]) {
  await Promise.resolve();
  yield* chunks;
}

function mockR2(overrides: Partial<R2Client> = {}): R2Client {
  return {
    deleteObjects(_bucket, keys) {
      return Promise.resolve({ deleted: keys, errors: [] });
    },
    getObject(_bucket, key) {
      return Promise.resolve({
        body: byteStream(Buffer.from(key)),
        status: 'ok' as const,
      });
    },
    headObject() {
      return Promise.resolve(null);
    },
    listObjects() {
      return Promise.resolve({ objects: [] });
    },
    ...overrides,
  };
}

async function withTempDirectory(
  callback: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'r2-backup-'));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe('backup CLI and sources', () => {
  it('parses required options and transfer sizes', () => {
    assert.deepEqual(
      parseBackupCliArgs([
        '--',
        '--download-dir',
        '/Volumes/backup',
        '--source',
        'audio/generated/',
        '--max-download-size',
        '1.5GiB',
        '--dry-run',
      ]),
      {
        downloadDir: '/Volumes/backup',
        dryRun: true,
        help: false,
        maxDownloadBytes: 1.5 * 1024 ** 3,
        source: 'audio/generated/',
      },
    );
    assert.throws(() => parseBackupCliArgs([]), /--download-dir is required/);
    assert.equal(parseBackupCliArgs(['--help']).help, true);
  });

  it('uses both default buckets and removes exact duplicates', () => {
    assert.deepEqual(
      resolveBackupSources(undefined, {
        R2_BUCKET_NAME: 'main-audio',
        R2_SPEECH_API_BUCKET_NAME: 'api-audio',
      }),
      [
        { bucket: 'main-audio', prefix: '' },
        { bucket: 'api-audio', prefix: '' },
      ],
    );
    assert.deepEqual(
      resolveBackupSources(' audio/generated/ ,audio/generated/, api ', {}),
      [
        { bucket: 'audio', prefix: 'generated/' },
        { bucket: 'api', prefix: '' },
      ],
    );
  });

  it('preserves exact prefixes and rejects overlap or empty sources', () => {
    assert.deepEqual(resolveBackupSources('audio/audio', {}), [
      { bucket: 'audio', prefix: 'audio' },
    ]);
    assert.throws(
      () => resolveBackupSources('audio/audio,audio/audio/', {}),
      /sources overlap/,
    );
    assert.throws(
      () => resolveBackupSources('audio,audio/generated/', {}),
      /sources overlap/,
    );
    assert.throws(
      () => resolveBackupSources('audio,,api', {}),
      /empty R2 location/,
    );
    assert.throws(() => resolveBackupSources('', {}), /empty R2 location/);
  });

  it('validates R2 credentials when the client is created', () => {
    assert.throws(() => createR2Client({}), /R2_ACCESS_KEY_ID/);
  });
});

describe('R2 client adapter', () => {
  it('sends If-Match and maps conditional request failures', async () => {
    const calls: Array<{
      command: unknown;
      options?: { abortSignal?: AbortSignal };
    }> = [];
    let handler: (command: unknown) => Promise<unknown> = () =>
      Promise.resolve({ body: undefined });
    const sender = {
      send(command: unknown, options?: { abortSignal?: AbortSignal }) {
        calls.push({ command, options });
        return handler(command);
      },
    } as unknown as Parameters<typeof createR2ClientAdapter>[0];
    const client = createR2ClientAdapter(sender);
    const signal = AbortSignal.timeout(1000);
    handler = () =>
      Promise.resolve({ Body: byteStream(Buffer.from('contents')) });

    const downloaded = await client.getObject(
      'audio',
      'file.wav',
      'ABCDEF0123456789ABCDEF0123456789',
      signal,
    );
    assert.equal(downloaded.status, 'ok');
    assert.ok(calls[0].command instanceof GetObjectCommand);
    assert.equal(
      (calls[0].command as GetObjectCommand).input.IfMatch,
      '"ABCDEF0123456789ABCDEF0123456789"',
    );
    assert.equal(calls[0].options?.abortSignal, signal);

    handler = () =>
      Promise.reject(
        Object.assign(new Error('precondition failed'), {
          $metadata: { httpStatusCode: 412 },
          name: 'PreconditionFailed',
        }),
      );
    assert.deepEqual(await client.getObject('audio', 'file.wav', 'etag'), {
      status: 'changed',
    });

    handler = () =>
      Promise.reject(
        Object.assign(new Error('not found'), {
          $metadata: { httpStatusCode: 404 },
          name: 'NoSuchKey',
        }),
      );
    assert.deepEqual(await client.getObject('audio', 'file.wav', 'etag'), {
      status: 'missing',
    });
  });

  it('rejects a successful response without a streaming body', async () => {
    const sender = {
      send() {
        return Promise.resolve({});
      },
    } as unknown as Parameters<typeof createR2ClientAdapter>[0];
    const client = createR2ClientAdapter(sender);

    await assert.rejects(
      client.getObject('audio', 'file.wav', 'etag'),
      /no streaming body/,
    );
  });
});

describe('local transfer safety', () => {
  it('rejects keys that cannot map losslessly', async () => {
    await assert.rejects(
      resolveLocalObjectPath('/tmp/backups', 'audio', 'a//b.wav'),
      /Unsafe R2 key/,
    );
    await assert.rejects(
      resolveLocalObjectPath('/tmp/backups', 'audio', 'a/./b.wav'),
      /Unsafe R2 key/,
    );
    await assert.rejects(
      resolveLocalObjectPath('/tmp/backups', 'audio', 'a/b.wav/'),
      /Unsafe R2 key/,
    );
    await assert.rejects(
      resolveLocalObjectPath('/tmp/backups', 'audio', 'a\\b.wav'),
      /Unsafe R2 key/,
    );
  });

  it('rejects symlinked destination components', async () => {
    await withTempDirectory(async (directory) => {
      const outside = await mkdtemp(path.join(tmpdir(), 'r2-outside-'));
      try {
        await mkdir(path.join(directory, 'audio'));
        await symlink(outside, path.join(directory, 'audio', 'linked'));
        await assert.rejects(
          resolveLocalObjectPath(directory, 'audio', 'linked/file.wav'),
          /Unsafe symlink/,
        );
      } finally {
        await rm(outside, { force: true, recursive: true });
      }
    });
  });

  it('passes the listed ETag to the conditional download', async () => {
    await withTempDirectory(async (directory) => {
      const contents = Buffer.from('download me');
      const item = object('generated/file.wav', {
        etag: createHash('md5').update(contents).digest('hex'),
        size: contents.length,
      });
      let expectedEtag: string | undefined;
      const result = await downloadWithoutOverwrite(
        mockR2({
          getObject(_bucket, _key, etag) {
            expectedEtag = etag;
            return Promise.resolve({
              body: byteStream(contents),
              status: 'ok' as const,
            });
          },
        }),
        item,
        directory,
      );

      assert.equal(expectedEtag, item.etag);
      assert.equal(result.status, 'downloaded-checksum');
      assert.deepEqual(await readFile(result.destination), contents);
    });
  });

  it('classifies changed and missing remote objects', async () => {
    await withTempDirectory(async (directory) => {
      const changed = await downloadWithoutOverwrite(
        mockR2({
          getObject() {
            return Promise.resolve({ status: 'changed' as const });
          },
        }),
        object('changed.wav'),
        directory,
      );
      const missing = await downloadWithoutOverwrite(
        mockR2({
          getObject() {
            return Promise.resolve({ status: 'missing' as const });
          },
        }),
        object('missing.wav'),
        directory,
      );

      assert.equal(changed.status, 'changed-in-r2');
      assert.match(changed.reason ?? '', /changed after it was listed/);
      assert.equal(missing.status, 'missing-from-r2');
      assert.match(missing.reason ?? '', /disappeared after it was listed/);
    });
  });

  it('rejects short downloads and removes partial files', async () => {
    await withTempDirectory(async (directory) => {
      const item = object('generated/short.wav', {
        etag: createHash('md5').update('longer').digest('hex'),
        size: 6,
      });
      const result = await downloadWithoutOverwrite(
        mockR2({
          getObject() {
            return Promise.resolve({
              body: byteStream(Buffer.from('short')),
              status: 'ok' as const,
            });
          },
        }),
        item,
        directory,
      );

      assert.equal(result.status, 'download-failure');
      assert.match(result.reason ?? '', /does not match R2 size/);
      const parent = path.dirname(result.destination);
      assert.deepEqual(await readdir(parent), []);
    });
  });
});

describe('backup planning and reporting', () => {
  it('plans a dry run without downloading or creating missing files', async () => {
    await withTempDirectory(async (directory) => {
      const downloadDir = path.join(directory, 'download');
      const reportDirectory = path.join(directory, 'reports');
      const checksumContents = Buffer.from('same');
      const sizeContents = Buffer.from('opaque');
      const checksum = object('existing/checksum.wav', {
        etag: createHash('md5').update(checksumContents).digest('hex'),
        size: checksumContents.length,
      });
      const sizeOnly = object('existing/size.wav', {
        etag: 'multipart-2',
        size: sizeContents.length,
      });
      const mismatch = object('existing/mismatch.wav', { size: 10 });
      const large = object('missing/large.wav', {
        lastModified: '2025-01-01T00:00:00.000Z',
        size: 10,
      });
      const small = object('missing/small.wav', {
        lastModified: '2025-02-01T00:00:00.000Z',
        size: 4,
      });
      for (const [item, contents] of [
        [checksum, checksumContents],
        [sizeOnly, sizeContents],
        [mismatch, Buffer.from('wrong')],
      ] as const) {
        const destination = await resolveLocalObjectPath(
          downloadDir,
          item.bucket,
          item.key,
        );
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, contents);
      }

      let getCalls = 0;
      const client = mockR2({
        getObject() {
          getCalls += 1;
          return Promise.resolve({ status: 'missing' as const });
        },
        listObjects() {
          return Promise.resolve({
            objects: [checksum, sizeOnly, mismatch, large, small].map(
              (item) => ({
                etag: item.etag,
                key: item.key,
                lastModified: new Date(item.lastModified),
                size: item.size,
              }),
            ),
          });
        },
      });
      const output = await runBackup(
        {
          downloadDir,
          dryRun: true,
          help: false,
          maxDownloadBytes: 5,
        },
        [{ bucket: 'audio', prefix: '' }],
        {
          client,
          interactive: false,
          log: () => undefined,
          now: () => new Date('2026-08-23T12:00:00.000Z'),
          reportDirectory,
        },
      );

      assert.equal(getCalls, 0);
      assert.equal(output.exitCode, 1);
      assert.deepEqual(
        output.report.results.map((result) => [result.key, result.status]),
        [
          ['missing/large.wav', 'deferred-by-size-cap'],
          ['missing/small.wav', 'selected-for-download'],
          ['existing/checksum.wav', 'existing-checksum'],
          ['existing/mismatch.wav', 'local-mismatch'],
          ['existing/size.wav', 'existing-size'],
        ],
      );
      await assert.rejects(
        readFile(path.join(downloadDir, 'audio', small.key)),
        /ENOENT/,
      );
      const saved = JSON.parse(await readFile(output.reportPath, 'utf8'));
      assert.equal(saved.results.length, 5);
      assert.deepEqual(saved.sourceTotals, [
        { bucket: 'audio', bytes: 34, count: 5, prefix: '' },
      ]);
    });
  });

  it('makes no downloads when any source listing fails', async () => {
    await withTempDirectory(async (directory) => {
      let downloadsStarted = false;
      const output = await runBackup(
        {
          downloadDir: path.join(directory, 'download'),
          dryRun: false,
          help: false,
        },
        [
          { bucket: 'good', prefix: '' },
          { bucket: 'bad', prefix: 'audio/' },
        ],
        {
          client: mockR2({
            listObjects(bucket) {
              return bucket === 'bad'
                ? Promise.reject(new Error('access denied'))
                : Promise.resolve({ objects: [] });
            },
          }),
          log: () => undefined,
          reportDirectory: path.join(directory, 'reports'),
          runDownloads() {
            downloadsStarted = true;
            return Promise.resolve([]);
          },
        },
      );

      assert.equal(downloadsStarted, false);
      assert.equal(output.exitCode, 1);
      assert.equal(output.report.results.length, 0);
      assert.deepEqual(output.report.listingFailures, [
        { bucket: 'bad', prefix: 'audio/', reason: 'access denied' },
      ]);
    });
  });

  it('records every mixed download result and returns a failure', async () => {
    await withTempDirectory(async (directory) => {
      const items = [
        object('one.wav'),
        object('two.wav'),
        object('three.wav'),
        object('four.wav'),
        object('five.wav'),
      ];
      const statuses = [
        'downloaded-checksum',
        'downloaded-size',
        'changed-in-r2',
        'missing-from-r2',
        'download-failure',
      ] as const;
      const output = await runBackup(
        {
          downloadDir: path.join(directory, 'download'),
          dryRun: false,
          help: false,
        },
        [{ bucket: 'audio', prefix: '' }],
        {
          client: mockR2({
            listObjects() {
              return Promise.resolve({
                objects: items.map((item) => ({
                  etag: item.etag,
                  key: item.key,
                  lastModified: new Date(item.lastModified),
                  size: item.size,
                })),
              });
            },
          }),
          log: () => undefined,
          reportDirectory: path.join(directory, 'reports'),
          runDownloads(selected) {
            return Promise.resolve(
              selected.map((_, index) => ({
                destination: '',
                reason: statuses[index].includes('download')
                  ? undefined
                  : 'expected test failure',
                status: statuses[index],
              })),
            );
          },
        },
      );

      assert.equal(output.exitCode, 1);
      assert.deepEqual(
        output.report.results.map((result) => result.status),
        statuses,
      );
      assert.equal(
        output.report.summary.bySource.reduce(
          (sum, entry) => sum + entry.count,
          0,
        ),
        items.length,
      );
      assert.equal(
        output.report.summary.byBucket.reduce(
          (sum, entry) => sum + entry.count,
          0,
        ),
        items.length,
      );
      assert.equal(
        output.report.summary.byStatus.reduce(
          (sum, entry) => sum + entry.count,
          0,
        ),
        items.length,
      );
    });
  });

  it('classifies filesystem inspection errors separately from unsafe paths', async () => {
    await withTempDirectory(async (directory) => {
      const downloadDir = path.join(directory, 'download');
      await mkdir(path.join(downloadDir, 'audio'), { recursive: true });
      await writeFile(path.join(downloadDir, 'audio', 'blocked'), 'file');
      const blocked = object('blocked/file.wav');
      const output = await runBackup(
        { downloadDir, dryRun: true, help: false },
        [{ bucket: 'audio', prefix: '' }],
        {
          client: mockR2({
            listObjects() {
              return Promise.resolve({
                objects: [
                  {
                    etag: blocked.etag,
                    key: blocked.key,
                    lastModified: new Date(blocked.lastModified),
                    size: blocked.size,
                  },
                ],
              });
            },
          }),
          log: () => undefined,
          reportDirectory: path.join(directory, 'reports'),
        },
      );

      assert.equal(output.report.results[0].status, 'local-read-failure');
      assert.equal(output.exitCode, 1);
    });
  });
});

describe('download scheduler', () => {
  it('runs at most four downloads and retains failures', async () => {
    const items = Array.from({ length: 7 }, (_, index) =>
      object(`file-${index}.wav`),
    );
    let active = 0;
    let maxActive = 0;
    const outcomes = await runDownloadEffects(
      items,
      async (_item, signal) => {
        assert.ok(signal);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          destination: '',
          reason: active === 1 ? 'failure' : undefined,
          status: active === 1 ? 'download-failure' : 'downloaded-checksum',
        };
      },
      100,
      false,
    );

    assert.equal(maxActive, 4);
    assert.equal(outcomes.length, items.length);
    assert.ok(
      outcomes.some((outcome) => outcome.status === 'download-failure'),
    );
    assert.ok(
      outcomes.some((outcome) => outcome.status === 'downloaded-checksum'),
    );
  });
});
