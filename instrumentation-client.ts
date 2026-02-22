// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

Sentry.init({
  dsn: 'https://784d74949017ccfddf3df01f224e3e8b@o4509116858695680.ingest.de.sentry.io/4509116876193872',

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Only capture errors from sexyvoice.ai domain
  allowUrls: [/https?:\/\/(www\.)?sexyvoice\.ai/],

  // Ignore specific error messages from browser extensions and wallets
  ignoreErrors: [
    // Browser extension errors
    /extension not found/i,
    /Cannot assign to read only property/i,
    // Wallet-related errors
    /MetaMask/i,
    /tronLink/i,
  ],

  beforeSend(event, hint) {
    const eventUrl = event.request?.url ?? '';

    // Additional filtering for app:// protocol (browser extensions)
    if (eventUrl.includes('app://')) {
      return null;
    }

    return event;
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  enableLogs: true,

  replaysSessionSampleRate: 0,

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  replaysOnErrorSampleRate: 0.1,
  integrations: [
    Sentry.replayIntegration({
      // Additional SDK configuration goes in here, for example:
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});

// This export will instrument router navigations, and is only relevant if you enable tracing.
// `captureRouterTransitionStart` is available from SDK version 9.12.0 onwards
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: '/seguimiento',
  ui_host: 'https://eu.posthog.com',
  defaults: '2025-05-24',
  capture_pageview: false, // We capture pageviews manually
  capture_pageleave: true, // Enable pageleave capture
});
