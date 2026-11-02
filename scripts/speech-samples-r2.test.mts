import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import {
  planSampleUploads,
  type UploadManifest,
  uploadSamples,
} from './lib/speech-sample-upload.mts';
import {
  assertSampleVoice,
  assertUniqueSamples,
  type GeneratedSample,
  readSampleCatalog,
  readVerifiedSample,
  type SampleManifest,
  sha256,
} from './lib/speech-samples.mts';
import {
  prepareVoiceCatalogSql,
  type VoiceCatalog,
} from './lib/voice-catalog-sql.mts';

const bytes = Buffer.from('ID3sample-audio');
const sample: GeneratedSample = {
  bytes: bytes.length,
  dollarAmount: 0.000_905,
  filename: 'kore-gpro38-preview.mp3',
  generatedAt: '2026-09-23T12:00:00Z',
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  language: 'multiple',
  name: 'kore',
  sha256: sha256(bytes),
  style: 'Warm and relaxed',
  text: "It's a lovely evening.",
  usage: { candidatesTokenCount: 100, promptTokenCount: 10 },
};
const catalog: VoiceCatalog = {
  folder: '.',
  model: 'gpro38',
  publicUrl: 'https://files.sexyvoice.ai',
  version: 1,
  voices: [
    {
      ...sample,
      row: {
        description: null,
        feature: 'tts',
        is_nsfw: false,
        is_public: true,
        sort_order: 0,
        type: 'Female',
        user_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      },
      sourceIds: [],
    },
  ],
};
const generated: SampleManifest = {
  failures: [],
  model: 'gemini-3.8-flash-tts',
  samples: [sample],
  version: 1,
};

async function fixture(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'speech-samples-test-'),
  );
  try {
    await writeFile(path.join(directory, sample.filename), bytes);
    await writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify(generated),
    );
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function client(send: (command: unknown) => unknown): Pick<S3Client, 'send'> {
  return {
    send: (command: unknown) => Promise.resolve().then(() => send(command)),
  } as Pick<S3Client, 'send'>;
}
const publicFetch = (async () =>
  new Response(bytes, {
    headers: { 'content-type': 'audio/mpeg' },
  })) as typeof fetch;
const matchingHead = {
  ContentLength: bytes.length,
  ContentType: 'audio/mpeg',
  Metadata: { sha256: sample.sha256 },
};

function plan(directory: string, samples = [sample]) {
  return planSampleUploads({
    directory,
    prefix: '.',
    publicUrl: catalog.publicUrl,
    samples,
  });
}

test('catalog contains 11 Gemini identities and one voice per available Spanish kind', async () => {
  const data = (await readSampleCatalog(
    new URL('gemini-38-catalog.json', import.meta.url).pathname,
  )) as VoiceCatalog;
  assert.equal(data.voices.length, 28);
  const classic = data.voices.filter((voice) => voice.sourceIds.length);
  assert.equal(classic.length, 11);
  assert.equal(new Set(classic.flatMap((voice) => voice.sourceIds)).size, 22);
  const provider = JSON.parse(
    await readFile(new URL('gemini-38-catalog.json', import.meta.url), 'utf8'),
  ) as {
    voices: { language: string; kind: string; provider: { accent: string } }[];
  };
  for (const [locale, count, accent] of [
    ['es-ES', 9, 'Castilian Spanish'],
    ['es-MX', 8, 'Mexico Spanish'],
  ] as const) {
    const regional = provider.voices.filter((voice) =>
      voice.language.startsWith(locale),
    );
    assert.equal(regional.length, count);
    assert.equal(new Set(regional.map((voice) => voice.kind)).size, count);
    assert.ok(regional.every((voice) => voice.provider.accent === accent));
  }
});

test('rejects Catalan, path traversal, and duplicate destinations', () => {
  assert.throws(
    () => assertSampleVoice({ ...sample, language: 'ca-ES' }),
    /Catalan/,
  );
  assert.throws(
    () => assertSampleVoice({ ...sample, filename: '../sample.mp3' }),
    /basename/,
  );
  assert.throws(
    () => assertUniqueSamples([sample, { ...sample, id: 'different' }]),
    /Duplicate sample filename/,
  );
});

test('detects modified files and refuses symlinks', async () =>
  fixture(async (directory) => {
    await writeFile(path.join(directory, sample.filename), 'changed');
    await assert.rejects(readVerifiedSample(directory, sample), /changed/);
    await rm(path.join(directory, sample.filename));
    await symlink('/etc/hosts', path.join(directory, sample.filename));
    await assert.rejects(readVerifiedSample(directory, sample), /regular file/);
  }));

test('maps root and folder paths without changing filenames', async () =>
  fixture(async (directory) => {
    const [root] = await plan(directory);
    assert.equal(root.key, sample.filename);
    assert.equal(root.url, `${catalog.publicUrl}/${sample.filename}`);
    const [nested] = await planSampleUploads({
      directory,
      prefix: 'previews/gemini',
      publicUrl: catalog.publicUrl,
      samples: [sample],
    });
    assert.equal(nested.key, `previews/gemini/${sample.filename}`);
    await assert.rejects(
      planSampleUploads({
        directory,
        prefix: '../other',
        publicUrl: catalog.publicUrl,
        samples: [sample],
      }),
      /Folder/,
    );
  }));

test('CLI defaults to a dry run without credentials or upload manifest', async () =>
  fixture(async (directory) => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'upload-speech-samples.mts',
        '--path',
        directory,
        '--bucket',
        'test-bucket',
        '--folder',
        '.',
        '--public-url',
        catalog.publicUrl,
      ],
      {
        cwd: import.meta.dirname,
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Dry run: no network requests/);
    await assert.rejects(readFile(path.join(directory, 'uploads.json')), {
      code: 'ENOENT',
    });
  }));

test('uploads conditionally and verifies R2 and public bytes', async () =>
  fixture(async (directory) => {
    const commands: unknown[] = [];
    const result = await uploadSamples({
      bucket: 'test-bucket',
      client: client((command) => {
        commands.push(command);
        if (command instanceof PutObjectCommand) {
          assert.equal(command.input.IfNoneMatch, '*');
          assert.equal(command.input.ContentType, 'audio/mpeg');
          return {};
        }
        assert.ok(command instanceof HeadObjectCommand);
        return matchingHead;
      }),
      directory,
      fetchPublic: publicFetch,
      samples: [sample],
      targets: await plan(directory),
    });
    assert.equal(commands.length, 2);
    assert.equal(result.verified.length, 1);
    assert.equal(result.failures.length, 0);
  }));

test('refuses an existing different object and records the failure', async () =>
  fixture(async (directory) => {
    const result = await uploadSamples({
      bucket: 'test-bucket',
      client: client((command) => {
        if (command instanceof PutObjectCommand)
          throw Object.assign(new Error('PreconditionFailed'), {
            $metadata: { httpStatusCode: 412 },
          });
        return { ...matchingHead, Metadata: { sha256: 'different' } };
      }),
      directory,
      fetchPublic: publicFetch,
      samples: [sample],
      targets: await plan(directory),
    });
    assert.equal(result.verified.length, 0);
    assert.match(result.failures[0].error, /does not match/);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(directory, 'uploads.json'), 'utf8')),
      result,
    );
  }));

test('can verify an identical upload after a retry', async () =>
  fixture(async (directory) => {
    const result = await uploadSamples({
      bucket: 'test-bucket',
      client: client((command) => {
        if (command instanceof PutObjectCommand)
          throw Object.assign(new Error('PreconditionFailed'), {
            $metadata: { httpStatusCode: 412 },
          });
        return matchingHead;
      }),
      directory,
      fetchPublic: publicFetch,
      samples: [sample],
      targets: await plan(directory),
    });
    assert.equal(result.verified.length, 1);
  }));

test('public hash mismatch cannot become a verified URL', async () =>
  fixture(async (directory) => {
    const result = await uploadSamples({
      bucket: 'test-bucket',
      client: client((command) =>
        command instanceof HeadObjectCommand ? matchingHead : {},
      ),
      directory,
      fetchPublic: (async () =>
        new Response('wrong', {
          headers: { 'content-type': 'audio/mpeg' },
        })) as typeof fetch,
      samples: [sample],
      targets: await plan(directory),
    });
    assert.equal(result.verified.length, 0);
    assert.match(result.failures[0].error, /hash differs/);
  }));

test('a failed upload does not discard other successful samples', async () =>
  fixture(async (directory) => {
    const second = { ...sample, filename: 'second.mp3', id: 'second' };
    await writeFile(path.join(directory, second.filename), bytes);
    const samples = [sample, second];
    const result = await uploadSamples({
      bucket: 'test-bucket',
      client: client((command) => {
        if (
          command instanceof PutObjectCommand &&
          command.input.Key === second.filename
        )
          throw new Error('Unavailable');
        return command instanceof HeadObjectCommand ? matchingHead : {};
      }),
      directory,
      fetchPublic: publicFetch,
      samples,
      targets: await plan(directory, samples),
    });
    assert.equal(result.verified.length, 1);
    assert.equal(result.failures.length, 1);
  }));

test('catalog SQL rejects ids that are not canonical UUIDs', () => {
  const malformed = { ...catalog.voices[0], id: '-'.repeat(36) };
  assert.throws(
    () =>
      prepareVoiceCatalogSql(
        { ...catalog, voices: [malformed] },
        { draft: true },
      ),
    /Invalid catalog UUID/,
  );
});

test('draft SQL is guarded and final SQL requires verified matching samples', async () =>
  fixture(async (directory) => {
    const draft = prepareVoiceCatalogSql(catalog, { draft: true });
    assert.match(draft, /RAISE EXCEPTION 'DRAFT/);
    assert.match(draft, /It''s a lovely evening/);
    assert.match(draft, /WHERE NOT EXISTS/);
    assert.match(draft, /ON CONFLICT \(id\) DO NOTHING/);
    assert.doesNotMatch(draft, /\b(?:UPDATE|DELETE)\b/i);
    assert.throws(
      () => prepareVoiceCatalogSql(catalog, {}),
      /requires complete/,
    );
    const uploads: UploadManifest = {
      bucket: 'test-bucket',
      failures: [],
      verified: await plan(directory),
      version: 1,
    };
    const sql = prepareVoiceCatalogSql(catalog, { generated, uploads });
    assert.doesNotMatch(sql, /RAISE EXCEPTION/);
    assert.throws(
      () =>
        prepareVoiceCatalogSql(catalog, {
          generated,
          uploads: { ...uploads, verified: [] },
        }),
      /Missing verified/,
    );
    assert.throws(
      () =>
        prepareVoiceCatalogSql(catalog, {
          generated: {
            ...generated,
            samples: [{ ...sample, text: 'changed' }],
          },
          uploads,
        }),
      /differs from catalog/,
    );
  }));
