import { initBotId } from 'botid/client/core';

// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://784d74949017ccfddf3df01f224e3e8b@o4509116858695680.ingest.de.sentry.io/4509116876193872',

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  enableLogs: true,

  replaysSessionSampleRate: 0.1,

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      // Additional SDK configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

// This export will instrument router navigations, and is only relevant if you enable tracing.
// `captureRouterTransitionStart` is available from SDK version 9.12.0 onwards
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// Define the paths that need bot protection.
// These are paths that are routed to by your app.
// These can be:
// - API endpoints (e.g., '/api/checkout')
// - Server actions invoked from a page (e.g., '/dashboard')
// - Dynamic routes (e.g., '/api/create/*')

// Only initialize BotID in production to avoid HTTPS errors in local development
// In development, checkBotId() on the server always returns isBot: false
if (process.env.NODE_ENV === 'production') {
  initBotId({
    protect: [
      // Dashboard pages with server actions (covers history, credits, settings, etc.)
      {
        path: '/*/dashboard/*',
        method: 'POST',
      },
      {
        path: '/*/dashboard',
        method: 'POST',
      },
      // Auth pages with server actions
      {
        path: '/*/reset-password',
        method: 'POST',
      },
      {
        path: '/*/protected/update-password',
        method: 'POST',
      },
      // API endpoints
      {
        path: '/api/clone-voice',
        method: 'POST',
      },
      {
        path: '/api/generate-voice',
        method: 'POST',
      },
      {
        path: '/api/generate-text',
        method: 'POST',
      },
      {
        path: '/api/estimate-credits',
        method: 'POST',
      },
    ],
  });
}
