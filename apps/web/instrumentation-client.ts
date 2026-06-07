// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import {
  addIntegration,
  captureRouterTransitionStart,
  init,
} from '@sentry/nextjs';

import { initPostHog } from '@/lib/posthog-browser';
import { shouldDropClientSentryEvent } from '@/lib/sentry/client-filters';

init({
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

  beforeSend(event) {
    const eventUrl = event.request?.url ?? '';

    // Additional filtering for app:// protocol (browser extensions)
    if (eventUrl.includes('app://')) {
      return null;
    }

    if (shouldDropClientSentryEvent(event)) {
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

  // Replay is added lazily (see below) so its bundle stays off the first-paint
  // critical path. Keep this empty here.
  integrations: [],
});

// This export will instrument router navigations, and is only relevant if you enable tracing.
// `captureRouterTransitionStart` is available from SDK version 9.12.0 onwards
export const onRouterTransitionStart = captureRouterTransitionStart;

// Run a callback once the browser is idle, falling back to a short timeout on
// engines without requestIdleCallback (e.g. older Safari).
function runWhenIdle(callback: () => void) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 5000 });
  } else {
    setTimeout(callback, 2000);
  }
}

// Lazy-load the Sentry Replay integration so its bundle is fetched in a separate
// async chunk during idle time instead of on the first-paint critical path.
// Replay only ever records on error (replaysOnErrorSampleRate: 0.1), so there's
// no benefit to shipping it eagerly. Kept on every route (incl. the landing
// page) so error sessions are still captured.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/session-replay
function initSentryReplay() {
  import('@sentry/nextjs')
    .then((lazySentry) => {
      addIntegration(
        lazySentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      );
    })
    .catch((err) => {
      console.warn(err);
    });
}

if (typeof window !== 'undefined') {
  // Replay loads on every route so error sessions are captured everywhere.
  runWhenIdle(initSentryReplay);

  // PostHog also needs to initialise when the entry URL is the landing page:
  // this module runs once per full page load, and later CTA clicks use client
  // navigation, so a landing-page skip would disable analytics for the session.
  runWhenIdle(() => {
    initPostHog().catch(() => undefined);
  });
}
