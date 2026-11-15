import { isE2E } from '@/lib/e2e-mode';

/** The Sentry project the browser, server and edge SDKs report to. */
export const SENTRY_DSN =
  'https://784d74949017ccfddf3df01f224e3e8b@o4509116858695680.ingest.de.sentry.io/4509116876193872';

/** The share of transactions traced in every runtime. */
export const TRACES_SAMPLE_RATE = 0.1;

/** Console calls the server and edge SDKs forward to Sentry as logs. */
export const CONSOLE_LOG_LEVELS: Array<'error' | 'log' | 'warn'> = [
  'log',
  'warn',
  'error',
];

/** The server and edge SDKs report from production, outside E2E runs. */
export function isServerSentryEnabled() {
  return process.env.NODE_ENV === 'production' && !isE2E();
}

/**
 * The browser SDK reports unless the build is for E2E tests, which inlines
 * `NEXT_PUBLIC_E2E_TEST_MODE`. Its URL filter keeps it to sexyvoice.ai.
 */
export function isClientSentryEnabled() {
  return process.env.NEXT_PUBLIC_E2E_TEST_MODE !== 'true';
}
