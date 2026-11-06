import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mock, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_ENV_FILES,
  inputPath,
  isLocalUrl,
  loadScriptEnv,
  parseCliArgs,
  printDatabaseTarget,
} from './lib/cli.mts';
import { createReadOnlyFetch } from './lib/supabase.mts';

const daysOption = {
  allowPositionals: true,
  options: { days: { type: 'string' } },
} as const;

async function withTemporaryDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scripts-cli-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test('drops the leading -- that pnpm 11 forwards', () => {
  const { positionals, values } = parseCliArgs(daysOption, [
    '--',
    '--days',
    '3',
    'report.csv',
  ]);
  assert.equal(values.days, '3');
  assert.deepEqual(positionals, ['report.csv']);
});

test('keeps a later -- as the end of options', () => {
  const { positionals, values } = parseCliArgs(daysOption, [
    '--days',
    '3',
    '--',
    '--not-an-option',
  ]);
  assert.equal(values.days, '3');
  assert.deepEqual(positionals, ['--not-an-option']);
});

test('rejects unknown options', () => {
  assert.throws(() => parseCliArgs(daysOption, ['--dayz', '3']), {
    code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION',
  });
});

test('resolves path arguments from the directory pnpm was run in', () => {
  const previous = process.env.INIT_CWD;
  try {
    process.env.INIT_CWD = '/repository';
    assert.equal(inputPath('apps/web/a.mp3'), '/repository/apps/web/a.mp3');
    assert.equal(inputPath('/absolute/a.mp3'), '/absolute/a.mp3');
    delete process.env.INIT_CWD;
    assert.equal(inputPath('a.mp3'), path.resolve('a.mp3'));
  } finally {
    if (previous === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = previous;
    }
  }
});

test('reads local env files before shared ones', () => {
  const relative = DEFAULT_ENV_FILES.map((file) =>
    path.relative(path.resolve(import.meta.dirname, '..'), file),
  );
  assert.deepEqual(relative, [
    'scripts/.env.local',
    'apps/web/.env.local',
    'scripts/.env',
    'apps/web/.env',
  ]);
});

test('named env files must exist and the first value wins', () =>
  withTemporaryDirectory(async (directory) => {
    const first = path.join(directory, 'first.env');
    const second = path.join(directory, 'second.env');
    await writeFile(first, 'CLI_TEST_FIRST=first\n');
    await writeFile(
      second,
      'CLI_TEST_FIRST=second\nCLI_TEST_SECOND=second\nCLI_TEST_SHELL=file\n',
    );
    process.env.CLI_TEST_SHELL = 'shell';
    try {
      assert.throws(
        () => loadScriptEnv([path.join(directory, 'missing.env')]),
        /Env file not found/,
      );
      assert.equal(process.env.CLI_TEST_FIRST, undefined);

      loadScriptEnv([first, second]);
      assert.equal(process.env.CLI_TEST_FIRST, 'first');
      assert.equal(process.env.CLI_TEST_SECOND, 'second');
      assert.equal(process.env.CLI_TEST_SHELL, 'shell');
    } finally {
      for (const name of [
        'CLI_TEST_FIRST',
        'CLI_TEST_SECOND',
        'CLI_TEST_SHELL',
      ]) {
        delete process.env[name];
      }
    }
  }));

test('names the target database and access mode', () => {
  const warn = mock.method(console, 'warn', () => undefined);
  try {
    printDatabaseTarget('http://127.0.0.1:54321', true);
    printDatabaseTarget('https://project.supabase.co', false);
  } finally {
    warn.mock.restore();
  }
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments[0]),
    [
      'Supabase: 127.0.0.1:54321 (LOCAL, read-only)',
      'Supabase: project.supabase.co (PRODUCTION, read-write)',
    ],
  );
  assert.equal(isLocalUrl('http://localhost:54321'), true);
  assert.equal(isLocalUrl('http://[::1]:54321'), true);
});

test('runs main only from the entry point and exits 1 on errors', () =>
  withTemporaryDirectory(async (directory) => {
    const cli = pathToFileURL(path.join(import.meta.dirname, 'lib/cli.mts'));
    const entry = path.join(directory, 'entry.mts');
    const importer = path.join(directory, 'importer.mts');
    await writeFile(
      entry,
      `import { runScript } from '${cli.href}';\nrunScript(import.meta.url, () => { throw new Error('boom'); });\n`,
    );
    await writeFile(importer, "import './entry.mts';\n");

    const run = (file: string) =>
      spawnSync(process.execPath, [file], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
      });

    const failed = run(entry);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /boom/);

    const imported = run(importer);
    assert.equal(imported.status, 0, imported.stderr);
    assert.doesNotMatch(imported.stderr, /boom/);
  }));

test('a read-only client blocks non-read HTTP methods', async () => {
  let calls = 0;
  const guardedFetch = createReadOnlyFetch(() => {
    calls += 1;
    return Promise.resolve(new Response(null, { status: 200 }));
  });

  await guardedFetch('https://example.com/credits', { method: 'GET' });
  await assert.rejects(
    guardedFetch('https://example.com/credits', { method: 'POST' }),
    /blocked HTTP POST/,
  );
  assert.equal(calls, 1);
});
