// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
  dsn: 'https://784d74949017ccfddf3df01f224e3e8b@o4509116858695680.ingest.de.sentry.io/4509116876193872',
  enabled: process.env.NODE_ENV === 'production',
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

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,
});
