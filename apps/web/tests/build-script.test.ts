import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageJsonPath = fileURLToPath(
  new URL('../package.json', import.meta.url),
);
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  scripts: Record<string, string>;
};

describe('production build', () => {
  it('uses webpack so Sentry can upload client source maps', () => {
    expect(packageJson.scripts.build).toBe('next build --webpack');
  });
});
