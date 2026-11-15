// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';

import {
  CONSOLE_LOG_LEVELS,
  isServerSentryEnabled,
  SENTRY_DSN,
  TRACES_SAMPLE_RATE,
} from '@/lib/sentry/config';
import { ignoredServerSpans } from '@/lib/sentry/server-filters';

Sentry.init({
  debug: false,
  dsn: SENTRY_DSN,
  enabled: isServerSentryEnabled(),
  enableLogs: true,
  ignoreSpans: ignoredServerSpans,
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: CONSOLE_LOG_LEVELS }),
  ],
  tracesSampleRate: TRACES_SAMPLE_RATE,
});
