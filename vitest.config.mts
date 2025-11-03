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
    testTimeout: 30000, // 30 seconds default timeout for all tests
    hookTimeout: 120000, // 2 minutes for hooks (beforeAll/afterAll) - needed for redis-memory-server binary download in CI
    onConsoleLog(log, type) {
      if (
        (log.startsWith('[STRIPE HOOK') && type === 'stdout') ||
        type === 'stderr'
      ) {
        return false;
      }
      return true;
    },
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/generate-voice.test.ts', 'tests/stripe-webhook.test.ts'],
    // exclude: ['lib/utils.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        // app/api/clone-voice/route.ts
        'app/api/generate-voice/*.ts',
        'app/api/stripe/webhook/route.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
