import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { runAction } from './cleanup-orphaned-r2-audio.mts';
import {
  analyzeInventory,
  buildAllowedLocations,
  type CleanupCliOptions,
  type CleanupConfig,
  createManifest,
  deleteCandidatesInBatches,
  evictDeletedAudioCache,
  fetchAllStorageKeys,
  filterAllowedInventoryObjects,
  findAllowedLocation,
  findOrphanCandidates,
  isAtLeastDaysOld,
  parseCleanupCliArgs,
  recheckCandidates,
  summarizeBuckets,
  validateManifest,
} from './lib/r2-orphan-audio-cleanup.mts';
import {
  downloadWithoutOverwrite,
  listAllObjects,
  parseByteSize,
  type R2Client,
  type R2ObjectMetadata,
  resolveLocalObjectPath,
  selectByDownloadLimit,
  simpleEtagMd5,
} from './lib/r2-transfer.mts';

const config: CleanupConfig = {
  apiBucket: 'api-audio',
  mainBucket: 'main-audio',
};
const now = new Date('2026-08-22T12:00:00.000Z');

function actionOptions(
  manifest: string,
  overrides: Partial<CleanupCliOptions> = {},
): CleanupCliOptions {
  return {
    delete: true,
    download: false,
    downloadDir: undefined,
    force: true,
    help: false,
    manifest,
    maxDownloadBytes: undefined,
    yes: true,
    ...overrides,
  };
}

async function writeManifest(
  directory: string,
  candidates: R2ObjectMetadata[],
): Promise<string> {
  const manifestPath = path.join(directory, 'manifest.json');
  await writeFile(
    manifestPath,
    `${JSON.stringify(createManifest(candidates, config, now), null, 2)}\n`,
  );
  return manifestPath;
}

function candidate(
  key: string,
  overrides: Partial<R2ObjectMetadata> = {},
): R2ObjectMetadata {
  return {
    bucket: 'main-audio',
    etag: 'd41d8cd98f00b204e9800998ecf8427e',
    key,
    lastModified: '2026-06-01T00:00:00.000Z',
    prefix: 'generated-audio-free/',
    size: 0,
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
    getObject() {
      return Promise.resolve({
        body: byteStream(new Uint8Array()),
        status: 'ok' as const,
      });
    },
    headObject(_bucket, key) {
      return Promise.resolve({
        etag: 'd41d8cd98f00b204e9800998ecf8427e',
        lastModified: new Date('2026-06-01T00:00:00.000Z'),
        size: key.length,
      });
    },
    listObjects() {
      return Promise.resolve({ objects: [] });
    },
    ...overrides,
  };
}

describe('size parsing', () => {
  it('parses decimal and binary units', () => {
    assert.equal(parseByteSize('1.5GB'), 1_500_000_000);
    assert.equal(parseByteSize('2 MiB'), 2 * 1024 * 1024);
    assert.equal(parseByteSize('1TB'), 1_000_000_000_000);
    assert.equal(parseByteSize('1TiB'), 1024 ** 4);
  });

  it('rejects zero and invalid limits', () => {
    assert.throws(() => parseByteSize('0GB'), /greater than zero/);
    assert.throws(() => parseByteSize('20'), /Size must use/);
    assert.throws(() => parseByteSize('-1GB'), /Size must use/);
  });
});

describe('candidate rules', () => {
  it('includes the exact 45-day boundary', () => {
    const boundary = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    assert.equal(isAtLeastDaysOld(boundary, now), true);
    assert.equal(
      isAtLeastDaysOld(new Date(boundary.getTime() + 1), now),
      false,
    );
  });

  it('protects a database key across both buckets', () => {
    const key = 'generated-audio-free/shared.mp3';
    const objects = [
      candidate(key),
      candidate(key, { bucket: 'api-audio' }),
      candidate('generated-audio-free/orphan.mp3', { bucket: 'api-audio' }),
    ];

    assert.deepEqual(
      findOrphanCandidates(objects, new Set([key]), now).map(
        (object) => object.key,
      ),
      ['generated-audio-free/orphan.mp3'],
    );
  });

  it('builds an auditable funnel for every allowed location', () => {
    const locations = buildAllowedLocations(config);
    const referencedKey = 'generated-audio-free/referenced.mp3';
    const inventory = analyzeInventory(
      [
        candidate('generated-audio-free/young.mp3', {
          lastModified: '2026-08-01T00:00:00.000Z',
          size: 1,
        }),
        candidate(referencedKey, { size: 2 }),
        candidate('generated-audio-free/orphan.mp3', { size: 3 }),
        candidate('generated-audio-free/api-orphan.mp3', {
          bucket: 'api-audio',
          size: 4,
        }),
      ],
      new Set([referencedKey]),
      now,
      locations,
    );

    assert.deepEqual(
      inventory.candidates.map((object) => object.key),
      [
        'generated-audio-free/api-orphan.mp3',
        'generated-audio-free/orphan.mp3',
      ],
    );
    assert.deepEqual(inventory.summary, [
      {
        bucket: 'api-audio',
        candidates: { bytes: 4, count: 1 },
        prefix: 'generated-audio-free/',
        referencedByDatabase: { bytes: 0, count: 0 },
        scanned: { bytes: 4, count: 1 },
        youngerThanCutoff: { bytes: 0, count: 0 },
      },
      {
        bucket: 'main-audio',
        candidates: { bytes: 0, count: 0 },
        prefix: 'cloned-audio-free/',
        referencedByDatabase: { bytes: 0, count: 0 },
        scanned: { bytes: 0, count: 0 },
        youngerThanCutoff: { bytes: 0, count: 0 },
      },
      {
        bucket: 'main-audio',
        candidates: { bytes: 3, count: 1 },
        prefix: 'generated-audio-free/',
        referencedByDatabase: { bytes: 2, count: 1 },
        scanned: { bytes: 6, count: 3 },
        youngerThanCutoff: { bytes: 1, count: 1 },
      },
    ]);
  });

  it('summarizes full buckets without admitting paid prefixes', () => {
    const locations = buildAllowedLocations(config);
    const objects = [
      candidate('generated-audio-free/free.mp3', { prefix: '', size: 3 }),
      candidate('generated-audio/paid.mp3', { prefix: '', size: 5 }),
      candidate('generated-audio/api-paid.mp3', {
        bucket: 'api-audio',
        prefix: '',
        size: 7,
      }),
    ];

    assert.deepEqual(summarizeBuckets(objects, ['main-audio', 'api-audio']), [
      { bucket: 'api-audio', bytes: 7, count: 1 },
      { bucket: 'main-audio', bytes: 8, count: 2 },
    ]);
    assert.deepEqual(
      filterAllowedInventoryObjects(objects, locations).map((object) => ({
        key: object.key,
        prefix: object.prefix,
      })),
      [
        {
          key: 'generated-audio-free/free.mp3',
          prefix: 'generated-audio-free/',
        },
      ],
    );
  });

  it('allows only configured bucket and prefix pairs', () => {
    const locations = buildAllowedLocations(config);
    assert.ok(
      findAllowedLocation(
        'main-audio',
        'generated-audio-free/a.mp3',
        locations,
      ),
    );
    assert.ok(
      findAllowedLocation('main-audio', 'cloned-audio-free/a.mp3', locations),
    );
    assert.equal(
      findAllowedLocation('main-audio', 'generated-audio/a.mp3', locations),
      undefined,
    );
    assert.equal(
      findAllowedLocation('api-audio', 'cloned-audio-free/a.mp3', locations),
      undefined,
    );
  });
});

describe('download selection', () => {
  it('sorts oldest first and keeps whole files within the cap', () => {
    const newest = candidate('generated-audio-free/new.mp3', {
      lastModified: '2026-06-03T00:00:00.000Z',
      size: 4,
    });
    const oldest = candidate('generated-audio-free/old.mp3', {
      lastModified: '2026-06-01T00:00:00.000Z',
      size: 6,
    });

    const selection = selectByDownloadLimit([newest, oldest], 9);
    assert.deepEqual(
      selection.selected.map((item) => item.key),
      [oldest.key],
    );
    assert.deepEqual(
      selection.deferred.map((item) => item.key),
      [newest.key],
    );
    assert.equal(selection.transferBytes, 6);
  });

  it('fits a later small file after deferring a large one', () => {
    const tooLarge = candidate('generated-audio-free/large.mp3', {
      lastModified: '2026-06-01T00:00:00.000Z',
      size: 11,
    });
    const small = candidate('generated-audio-free/small.mp3', {
      lastModified: '2026-06-02T00:00:00.000Z',
      size: 4,
    });

    const selection = selectByDownloadLimit([small, tooLarge], 10);
    assert.deepEqual(
      selection.deferred.map((item) => item.key),
      [tooLarge.key],
    );
    assert.deepEqual(
      selection.selected.map((item) => item.key),
      [small.key],
    );
  });
});

describe('manifest and CLI validation', () => {
  it('validates a generated manifest and rejects unknown prefixes', () => {
    const manifest = createManifest(
      [candidate('generated-audio-free/a.mp3')],
      config,
      now,
    );
    assert.deepEqual(validateManifest(manifest, config), manifest);

    const invalidCutoff = structuredClone(manifest);
    invalidCutoff.cutoff = '2026-01-01T00:00:00.000Z';
    assert.throws(
      () => validateManifest(invalidCutoff, config),
      /cutoff does not match/,
    );

    const invalid = structuredClone(manifest);
    invalid.candidates[0].key = 'generated-audio/a.mp3';
    assert.throws(
      () => validateManifest(invalid, config),
      /outside the bucket and prefix allowlist/,
    );
  });

  it('validates inventory totals when they are present', () => {
    const locations = buildAllowedLocations(config);
    const inventory = analyzeInventory(
      [candidate('generated-audio-free/a.mp3', { size: 10 })],
      new Set(),
      now,
      locations,
    );
    const bucketTotals = [
      { bucket: 'api-audio', bytes: 0, count: 0 },
      { bucket: 'main-audio', bytes: 10, count: 1 },
    ];
    const manifest = createManifest(
      inventory.candidates,
      config,
      now,
      inventory.summary,
      bucketTotals,
    );
    assert.deepEqual(validateManifest(manifest, config), manifest);

    const invalid = structuredClone(manifest);
    if (!invalid.inventory) {
      assert.fail('Expected inventory statistics');
    }
    invalid.inventory[0].scanned.count += 1;
    assert.throws(
      () => validateManifest(invalid, config),
      /totals do not add up/,
    );

    const invalidBucketTotal = structuredClone(manifest);
    if (!invalidBucketTotal.bucketTotals) {
      assert.fail('Expected bucket totals');
    }
    invalidBucketTotal.bucketTotals[1].count = 0;
    assert.throws(
      () => validateManifest(invalidBucketTotal, config),
      /inventory exceeds bucket total/,
    );
  });

  it('rejects manifests from another bucket configuration', () => {
    const manifest = createManifest([], config, now);
    assert.throws(
      () =>
        validateManifest(manifest, {
          apiBucket: 'other-api',
          mainBucket: config.mainBucket,
        }),
      /bucket names do not match/,
    );
  });

  it('enforces CLI option dependencies', () => {
    assert.equal(parseCleanupCliArgs(['--', '--help']).help, true);
    assert.deepEqual(parseCleanupCliArgs([]), {
      delete: false,
      download: false,
      downloadDir: undefined,
      force: false,
      help: false,
      manifest: undefined,
      maxDownloadBytes: undefined,
      yes: false,
    });
    assert.throws(
      () => parseCleanupCliArgs(['--download']),
      /--download requires --manifest/,
    );
    assert.throws(
      () => parseCleanupCliArgs(['--download-dir', '/tmp/audio']),
      /--download-dir requires --download/,
    );
    assert.throws(
      () =>
        parseCleanupCliArgs([
          '--manifest',
          'manifest.json',
          '--delete',
          '--yes',
        ]),
      /--delete requires --download or --force/,
    );
    assert.throws(
      () =>
        parseCleanupCliArgs([
          '--manifest',
          'manifest.json',
          '--delete',
          '--force',
        ]),
      /--delete requires --yes/,
    );
    const downloadWithIgnoredForce = [
      '--manifest',
      'manifest.json',
      '--download',
      '--download-dir',
      '/tmp/audio',
      '--max-download-size',
      '1GB',
      '--force',
    ];
    assert.doesNotThrow(() => parseCleanupCliArgs(downloadWithIgnoredForce));
    assert.doesNotThrow(() =>
      parseCleanupCliArgs([...downloadWithIgnoredForce, '--delete', '--yes']),
    );
  });
});

describe('local backup safety', () => {
  it('rejects path traversal', async () => {
    await assert.rejects(
      resolveLocalObjectPath(
        '/tmp/backups',
        'main-audio',
        'generated-audio-free/../../outside.mp3',
      ),
      /Unsafe R2 key/,
    );
    await assert.rejects(
      resolveLocalObjectPath('/tmp/backups', 'main-audio', '/outside.mp3'),
      /Unsafe R2 key/,
    );
  });

  it('recognizes simple ETags and rejects opaque ETags', () => {
    assert.equal(
      simpleEtagMd5('"D41D8CD98F00B204E9800998ECF8427E"'),
      'd41d8cd98f00b204e9800998ecf8427e',
    );
    assert.equal(simpleEtagMd5('abc-2'), null);
    assert.equal(simpleEtagMd5('opaque'), null);
  });

  it('keeps opaque-ETag downloads without marking them verified', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'r2-cleanup-'));
    try {
      const contents = Buffer.from('multipart backup');
      const item = candidate('generated-audio-free/opaque.mp3', {
        etag: 'opaque-2',
        size: contents.length,
      });
      const result = await downloadWithoutOverwrite(
        mockR2({
          getObject() {
            return Promise.resolve({
              body: byteStream(contents),
              status: 'ok' as const,
            });
          },
        }),
        item,
        directory,
      );

      assert.equal(result.status, 'downloaded-size');
      assert.deepEqual(await readFile(result.destination), contents);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('stops a changed object before it exceeds the expected size', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'r2-cleanup-'));
    try {
      const item = candidate('generated-audio-free/changed.mp3', {
        etag: createHash('md5').update('a').digest('hex'),
        size: 1,
      });
      const result = await downloadWithoutOverwrite(
        mockR2({
          getObject() {
            return Promise.resolve({
              body: byteStream(Buffer.from('too large')),
              status: 'ok' as const,
            });
          },
        }),
        item,
        directory,
      );

      assert.equal(result.status, 'download-failure');
      assert.match(result.reason ?? '', /exceeded the expected size/);
      await assert.rejects(readFile(result.destination), /ENOENT/);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('never overwrites an existing local file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'r2-cleanup-'));
    try {
      const contents = Buffer.from('keep this file');
      const item = candidate('generated-audio-free/existing.mp3', {
        etag: createHash('md5').update(contents).digest('hex'),
        size: contents.length,
      });
      const destination = await resolveLocalObjectPath(
        directory,
        item.bucket,
        item.key,
      );
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, contents);
      let getCalls = 0;
      const result = await downloadWithoutOverwrite(
        mockR2({
          getObject() {
            getCalls += 1;
            return Promise.resolve({
              body: byteStream(Buffer.from('replacement')),
              status: 'ok' as const,
            });
          },
        }),
        item,
        directory,
      );

      assert.equal(result.status, 'existing-checksum');
      assert.equal(getCalls, 0);
      assert.deepEqual(await readFile(destination), contents);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe('paginated reads and live checks', () => {
  it('fetches all Supabase pages', async () => {
    const calls: [number, number][] = [];
    const keys = await fetchAllStorageKeys(
      {
        listStorageKeys(from, to) {
          calls.push([from, to]);
          return Promise.resolve(from === 0 ? ['a', 'b'] : ['c']);
        },
      },
      2,
    );

    assert.deepEqual([...keys], ['a', 'b', 'c']);
    assert.deepEqual(calls, [
      [0, 1],
      [2, 3],
    ]);
  });

  it('fetches all R2 pages', async () => {
    const tokens: Array<string | undefined> = [];
    const objects = await listAllObjects(
      mockR2({
        listObjects(_bucket, _prefix, token) {
          tokens.push(token);
          if (!token) {
            return Promise.resolve({
              nextContinuationToken: 'next',
              objects: [
                {
                  etag: 'etag-a',
                  key: 'generated-audio-free/a.mp3',
                  lastModified: new Date('2026-06-01T00:00:00.000Z'),
                  size: 1,
                },
              ],
            });
          }
          return Promise.resolve({
            objects: [
              {
                etag: 'etag-b',
                key: 'generated-audio-free/b.mp3',
                lastModified: new Date('2026-06-02T00:00:00.000Z'),
                size: 2,
              },
            ],
          });
        },
      }),
      { bucket: 'main-audio', prefix: 'generated-audio-free/' },
    );

    assert.deepEqual(tokens, [undefined, 'next']);
    assert.deepEqual(
      objects.map((object) => object.key),
      ['generated-audio-free/a.mp3', 'generated-audio-free/b.mp3'],
    );
  });

  it('reports HeadObject failures without aborting other checks', async () => {
    const failed = candidate('generated-audio-free/failed.mp3');
    const missing = candidate('generated-audio-free/missing.mp3');
    const results = await recheckCandidates(
      [failed, missing],
      new Set(),
      mockR2({
        headObject(_bucket, key) {
          if (key === failed.key) {
            return Promise.reject(new Error('R2 unavailable'));
          }
          return Promise.resolve(null);
        },
      }),
      buildAllowedLocations(config),
      now,
    );

    assert.deepEqual(
      results.map((result) => result.status),
      ['r2-check-failure', 'missing-from-r2'],
    );
  });

  it('protects referenced keys and reports changed and missing objects', async () => {
    const referenced = candidate('generated-audio-free/referenced.mp3');
    const changed = candidate('generated-audio-free/changed.mp3', { size: 10 });
    const missing = candidate('generated-audio-free/missing.mp3');
    const results = await recheckCandidates(
      [referenced, changed, missing],
      new Set([referenced.key]),
      mockR2({
        headObject(_bucket, key) {
          if (key === missing.key) {
            return Promise.resolve(null);
          }
          return Promise.resolve({
            etag: changed.etag,
            lastModified: new Date(changed.lastModified),
            size: changed.size + 1,
          });
        },
      }),
      buildAllowedLocations(config),
      now,
    );

    assert.deepEqual(
      results.map((result) => result.status),
      ['referenced-by-database', 'changed-in-r2', 'missing-from-r2'],
    );
  });
});

describe('cleanup action orchestration', () => {
  it('validates destructive options for direct callers before work', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'r2-cleanup-action-'));
    try {
      const manifestPath = await writeManifest(directory, []);
      let reportWrites = 0;
      let storageReads = 0;
      const dependencies = {
        client: mockR2(),
        storageKeys: {
          hasStorageKey() {
            return Promise.resolve(false);
          },
          listStorageKeys() {
            storageReads += 1;
            return Promise.resolve([]);
          },
        },
        writeReport() {
          reportWrites += 1;
          return Promise.resolve();
        },
      };

      await assert.rejects(
        runAction(
          actionOptions(manifestPath, { force: false }),
          config,
          dependencies,
        ),
        /--delete requires --download or --force/,
      );
      await assert.rejects(
        runAction(
          actionOptions(manifestPath, { yes: false }),
          config,
          dependencies,
        ),
        /--delete requires --yes/,
      );
      assert.equal(storageReads, 0);
      assert.equal(reportWrites, 0);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('rejects a missing download root before reading the manifest', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'r2-cleanup-action-'));
    try {
      const downloadDir = path.join(directory, 'missing-download');
      const manifestPath = path.join(directory, 'missing-manifest.json');
      let deletes = 0;
      let storageReads = 0;

      await assert.rejects(
        runAction(
          actionOptions(manifestPath, {
            download: true,
            downloadDir,
            force: false,
            maxDownloadBytes: 1,
          }),
          config,
          {
            client: mockR2({
              deleteObjects() {
                deletes += 1;
                return Promise.resolve({ deleted: [], errors: [] });
              },
            }),
            storageKeys: {
              hasStorageKey() {
                storageReads += 1;
                return Promise.resolve(false);
              },
              listStorageKeys() {
                storageReads += 1;
                return Promise.resolve([]);
              },
            },
          },
        ),
        (error: NodeJS.ErrnoException) => {
          assert.equal(error.code, 'ENOENT');
          assert.equal(error.path, downloadDir);
          return true;
        },
      );
      assert.equal(storageReads, 0);
      assert.equal(deletes, 0);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('checks live state before deleting, then evicts and reports', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'r2-cleanup-action-'));
    try {
      const item = candidate('generated-audio-free/delete.wav');
      const manifestPath = await writeManifest(directory, [item]);
      const events: string[] = [];
      const writtenReports: unknown[] = [];
      const output = await runAction(actionOptions(manifestPath), config, {
        audioUrlCache: {
          deleteKey() {
            events.push('cache');
            return Promise.resolve();
          },
        },
        client: mockR2({
          deleteObjects(_bucket, keys) {
            events.push('delete');
            return Promise.resolve({ deleted: keys, errors: [] });
          },
          headObject() {
            events.push('head');
            return Promise.resolve({
              etag: item.etag,
              lastModified: new Date(item.lastModified),
              size: item.size,
            });
          },
        }),
        log: () => undefined,
        now: () => now,
        storageKeys: {
          hasStorageKey() {
            events.push('has');
            return Promise.resolve(false);
          },
          listStorageKeys() {
            events.push('list');
            return Promise.resolve([]);
          },
        },
        writeReport(_reportPath, report) {
          events.push('report');
          writtenReports.push(report);
          return Promise.resolve();
        },
      });

      assert.deepEqual(events, [
        'list',
        'head',
        'has',
        'head',
        'delete',
        'cache',
        'report',
      ]);
      assert.equal(output.exitCode, 0);
      assert.equal(output.report.results[0].status, 'deleted');
      assert.equal(writtenReports[0], output.report);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('reports earlier deletions when a later candidate throws', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'r2-cleanup-action-'));
    try {
      const first = candidate('generated-audio-free/first.wav');
      const second = candidate('generated-audio-free/second.wav');
      const manifestPath = await writeManifest(directory, [first, second]);
      let nowCalls = 0;
      const output = await runAction(actionOptions(manifestPath), config, {
        audioUrlCache: {
          deleteKey() {
            return Promise.resolve();
          },
        },
        client: mockR2({
          headObject(_bucket, key) {
            const item = key === first.key ? first : second;
            return Promise.resolve({
              etag: item.etag,
              lastModified: new Date(item.lastModified),
              size: item.size,
            });
          },
        }),
        log: () => undefined,
        now: () => {
          nowCalls += 1;
          if (nowCalls === 3) {
            throw new Error('clock failed');
          }
          return now;
        },
        storageKeys: {
          hasStorageKey() {
            return Promise.resolve(false);
          },
          listStorageKeys() {
            return Promise.resolve([]);
          },
        },
        writeReport() {
          return Promise.resolve();
        },
      });

      assert.deepEqual(
        output.report.results.map((result) => result.status),
        ['deleted', 'deletion-failure'],
      );
      assert.match(output.report.results[1].reason ?? '', /clock failed/);
      assert.equal(output.exitCode, 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('deletes only checksum-backed objects in download mode', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'r2-cleanup-action-'));
    try {
      const checksum = candidate('generated-audio-free/checksum.wav');
      const opaque = candidate('generated-audio-free/opaque.wav', {
        etag: 'opaque-2',
      });
      const manifestPath = await writeManifest(directory, [checksum, opaque]);
      const downloadDir = path.join(directory, 'downloads');
      for (const item of [checksum, opaque]) {
        const destination = await resolveLocalObjectPath(
          downloadDir,
          item.bucket,
          item.key,
        );
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, new Uint8Array());
      }
      const deletedKeys: string[] = [];
      const output = await runAction(
        actionOptions(manifestPath, {
          download: true,
          downloadDir,
          force: false,
          maxDownloadBytes: 1,
        }),
        config,
        {
          audioUrlCache: {
            deleteKey() {
              return Promise.resolve();
            },
          },
          client: mockR2({
            deleteObjects(_bucket, keys) {
              deletedKeys.push(...keys);
              return Promise.resolve({ deleted: keys, errors: [] });
            },
            headObject(_bucket, key) {
              const item = key === checksum.key ? checksum : opaque;
              return Promise.resolve({
                etag: item.etag,
                lastModified: new Date(item.lastModified),
                size: item.size,
              });
            },
          }),
          log: () => undefined,
          now: () => now,
          storageKeys: {
            hasStorageKey() {
              return Promise.resolve(false);
            },
            listStorageKeys() {
              return Promise.resolve([]);
            },
          },
          writeReport() {
            return Promise.resolve();
          },
        },
      );

      assert.deepEqual(deletedKeys, [checksum.key]);
      assert.deepEqual(
        output.report.results.map((result) => result.status),
        ['deleted', 'unverifiable-checksum'],
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe('deletion results', () => {
  it('evicts dashboard cache keys only for the main bucket', async () => {
    const deletedKeys: string[] = [];
    const cache = {
      deleteKey(key: string) {
        deletedKeys.push(key);
        return Promise.resolve();
      },
    };
    const mainCandidate = candidate('generated-audio-free/main.wav');
    const apiCandidate = candidate('generated-audio-free/api.wav', {
      bucket: config.apiBucket,
    });

    await evictDeletedAudioCache(mainCandidate, config.mainBucket, cache);
    await evictDeletedAudioCache(apiCandidate, config.mainBucket, cache);

    assert.deepEqual(deletedKeys, [mainCandidate.key]);
  });

  it('reports cache eviction failures to the caller', async () => {
    await assert.rejects(
      evictDeletedAudioCache(
        candidate('generated-audio-free/main.wav'),
        config.mainBucket,
        {
          deleteKey() {
            return Promise.reject(new Error('Redis unavailable'));
          },
        },
      ),
      /Redis unavailable/,
    );
  });

  it('records partial deletion failures without retrying successes', async () => {
    const first = candidate('generated-audio-free/first.mp3');
    const second = candidate('generated-audio-free/second.mp3');
    let calls = 0;
    const results = await deleteCandidatesInBatches(
      mockR2({
        deleteObjects() {
          calls += 1;
          return Promise.resolve({
            deleted: [first.key],
            errors: [
              {
                code: 'AccessDenied',
                key: second.key,
                message: 'denied',
              },
            ],
          });
        },
      }),
      [first, second],
      100,
    );

    assert.equal(calls, 1);
    assert.deepEqual(
      results.map((result) => result.status),
      ['deleted', 'deletion-failure'],
    );
    assert.match(results[1].reason ?? '', /AccessDenied: denied/);
  });
});
