import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

loadEnvFile('.env.test');

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30_000, // 30 seconds default timeout for all tests
    hookTimeout: 120_000, // 2 minutes for hooks (beforeAll/afterAll) - needed for redis-memory-server binary download in CI
    onConsoleLog(log, type) {
      if (
        ((['[STRIPE HOOK', '[STRIPE ADMIN'].some((str) =>
          log.startsWith(str),
        ) ||
          log.includes('OTHER_GEMINI_BLOCK')) &&
          type === 'stdout') ||
        type === 'stderr'
      ) {
        return false;
      }
      return true;
    },
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/*.test.ts',
      'tests/*.test.tsx',
      'tests/**/*.test.tsx',
      'components/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'lib/utils.ts',
        'app/api/clone-voice/*.ts',
        'app/api/generate-voice/*.ts',
        'app/api/stripe/webhook/route.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});
