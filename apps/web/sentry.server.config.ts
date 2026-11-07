// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';

import {
  CONSOLE_LOG_LEVELS,
  isServerSentryEnabled,
  SENTRY_DSN,
  TRACES_SAMPLE_RATE,
} from '@/lib/sentry/config';
import {
  ignoredServerSpans,
  sanitizeServerEvent,
} from '@/lib/sentry/server-filters';

Sentry.init({
  beforeSend: sanitizeServerEvent,
  debug: false,
  dsn: SENTRY_DSN,
  enabled: isServerSentryEnabled(),
  enableLogs: true,
  ignoreSpans: ignoredServerSpans,
  integrations: [
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    Sentry.consoleLoggingIntegration({ levels: CONSOLE_LOG_LEVELS }),
  ],
  tracesSampleRate: TRACES_SAMPLE_RATE,
});
