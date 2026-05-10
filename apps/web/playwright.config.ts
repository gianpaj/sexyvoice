import path from 'node:path';
import { createArgosReporterOptions } from '@argos-ci/playwright/reporter';
import { defineConfig, devices } from '@playwright/test';
/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';

// biome-ignore lint/correctness/noGlobalDirnameFilename: bug
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

if (process.env.PLAYWRIGHT_TEST_USER_EMAIL) {
  process.env.E2E_TEST_MODE ??= 'true';
}

const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT || '3100');
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PLAYWRIGHT_PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  // Each test runs in its own browser context/page, so React state is fully
  // isolated between workers — no race conditions possible.
  // Use more workers in CI (production server handles concurrency well) and
  // a conservative count locally (dev server is single-threaded for compiles).
  workers: process.env.CI ? 4 : 2,
  // reporter: 'html',
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    // Use "dot" reporter on CI, "list" otherwise (Playwright default).
    process.env.CI ? ['dot'] : ['list'],
    // Add Argos reporter.
    [
      '@argos-ci/playwright/reporter',
      createArgosReporterOptions({
        // Upload to Argos on CI only.
        // uploadToArgos: true,
        uploadToArgos: !!process.env.CI,

        // Set your Argos token (required if not using GitHub Actions).
        token: process.env.ARGOS_TOKEN,
      }),
    ],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: PLAYWRIGHT_BASE_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot only on failure */
    screenshot: 'only-on-failure',

    /* Record video only on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup project
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Main tests that depend on authentication
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use prepared auth state
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     storageState: '.auth/user.json',
    //   },
    //   dependencies: ['setup'],
    // },

    // {
    //   name: 'webkit',
    //   use: {
    //     ...devices['Desktop Safari'],
    //     storageState: '.auth/user.json',
    //   },
    //   dependencies: ['setup'],
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: {
    //     ...devices['Pixel 5'],
    //     storageState: '.auth/user.json',
    //   },
    //   dependencies: ['setup'],
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: {
    //     ...devices['iPhone 12'],
    //     storageState: '.auth/user.json',
    //   },
    //   dependencies: ['setup'],
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: {
    //     ...devices['Desktop Edge'],
    //     channel: 'msedge',
    //     storageState: '.auth/user.json',
    //   },
    //   dependencies: ['setup'],
    // },
    // {
    //   name: 'Google Chrome',
    //   use: {
    //     ...devices['Desktop Chrome'],
    //     channel: 'chrome',
    //     storageState: '.auth/user.json',
    //   },
    //   dependencies: ['setup'],
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI
    ? {
        // In CI, the workflow builds the app before tests, so only start the
        // server here. Locally, keep building first so `pnpm run test:e2e` works
        // without requiring a manual build step.
        command: `pnpm exec next start --port ${PLAYWRIGHT_PORT}`,
        url: PLAYWRIGHT_BASE_URL,
        timeout: 300 * 1000,
      }
    : undefined,
});
