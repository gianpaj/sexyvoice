import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const biome = createRequire(import.meta.url).resolve(
  '@biomejs/biome/bin/biome',
);
const cwd = fileURLToPath(new URL('../', import.meta.url));

function lint(source: string, directory = 'lib') {
  // Real files exercise the repository's path-scoped plugin configuration.
  const fixtureDir = mkdtempSync(join(cwd, directory, 'biome-claims-fixture-'));
  try {
    const path = join(fixtureDir, 'fixture.tsx');
    writeFileSync(path, source);
    const result = spawnSync(
      process.execPath,
      [biome, 'lint', '--only=plugin', path],
      { cwd, encoding: 'utf8', timeout: 10_000 },
    );
    if (result.error) throw result.error;
    return { output: result.stdout + result.stderr, status: result.status };
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
}

describe('Biome verified claims rule', () => {
  it.each(['app', 'app/api', 'components', 'hooks', 'lib'])(
    'rejects Auth user lookups in %s',
    (path) => {
      const result = lint('const user = await supabase.auth.getUser();', path);
      expect(result.status).toBe(1);
      expect(result.output).toContain('Use getVerifiedClaims()');
    },
  );

  it('also rejects a differently named client and an explicit token', () => {
    expect(lint('await client.auth.getUser(token);').status).toBe(1);
  });

  it('accepts a reasoned suppression immediately before the lookup', () => {
    const result = lint(`
// biome-ignore lint/plugin/use-verified-claims: Password verification needs current Auth email.
const { data } = await supabase.auth.getUser();
`);
    expect(result.status, result.output).toBe(0);
  });

  it('allows verified claims and unrelated user methods', () => {
    const result = lint(`
await getVerifiedClaims(supabase);
await supabase.auth.getClaims();
await repository.getUser();
await getUserById(id);
`);
    expect(result.status, result.output).toBe(0);
  });

  it('does not restrict test mocks and SDK tests', () => {
    const result = lint('await client.auth.getUser();', 'tests');
    expect(result.status, result.output).toBe(0);
  });

  it('preserves the existing API error-response rule', () => {
    const result = lint(
      'NextResponse.json({ error: "Unauthorized" }, { status: 401 });',
      'app/api',
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain('APIErrorResponse');
  });
});
