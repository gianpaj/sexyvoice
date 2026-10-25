// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';

import { isE2E } from '@/lib/e2e-mode';
import { sanitizeServerEvent } from '@/lib/sentry/server-filters';
import {
  sanitizeSupabaseBreadcrumb,
  sanitizeSupabaseEvent,
  sanitizeSupabaseSpan,
  sanitizeSupabaseTransaction,
} from '@/lib/sentry/supabase-privacy';

Sentry.init({
  beforeBreadcrumb: sanitizeSupabaseBreadcrumb,
  beforeSend: (event, hint) =>
    sanitizeSupabaseEvent(sanitizeServerEvent(event), hint),
  beforeSendSpan: sanitizeSupabaseSpan,
  beforeSendTransaction: sanitizeSupabaseTransaction,
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
  dsn: 'https://784d74949017ccfddf3df01f224e3e8b@o4509116858695680.ingest.de.sentry.io/4509116876193872',
  enabled: process.env.NODE_ENV === 'production' && !isE2E(),
  enableLogs: true,
  integrations: [
    // Add the Vercel AI SDK integration
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
  ],
  propagateTraceparent: true,

  // instrumentation.ts registers the OpenTelemetry provider through @vercel/otel.
  skipOpenTelemetrySetup: true,

  // Samples every exported trace, including the OTLP export to Dash0.
  tracesSampleRate: 0.1,
});
