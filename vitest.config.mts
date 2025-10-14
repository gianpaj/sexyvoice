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
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
