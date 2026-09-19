import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

loadEnvFile('.env.test');

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
  test: {
    coverage: {
      include: [
        'lib/utils.ts',
        'app/api/clone-voice/*.ts',
        'app/api/generate-voice/*.ts',
        'app/api/stripe/webhook/route.ts',
      ],
      provider: 'v8',
    },
    environment: 'node',
    globals: true,
    hookTimeout: 120_000, // 2 minutes for hooks (beforeAll/afterAll) - needed for redis-memory-server binary download in CI
    include: [
      'tests/*.test.ts',
      'tests/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
    ],
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
    testTimeout: 30_000, // 30 seconds default timeout for all tests
  },
});
