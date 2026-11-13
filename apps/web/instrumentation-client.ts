// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import {
  addIntegration,
  captureRouterTransitionStart,
  init,
} from '@sentry/nextjs';

import { initPostHog } from '@/lib/posthog-browser';
import {
  CLIENT_ALLOW_URLS,
  IGNORED_CLIENT_ERRORS,
  shouldDropClientSentryEvent,
} from '@/lib/sentry/client-filters';
import {
  isClientSentryEnabled,
  SENTRY_DSN,
  TRACES_SAMPLE_RATE,
} from '@/lib/sentry/config';

init({
  allowUrls: CLIENT_ALLOW_URLS,
  beforeSend: (event) => (shouldDropClientSentryEvent(event) ? null : event),
  debug: false,
  dsn: SENTRY_DSN,
  enableLogs: true,
  enabled: isClientSentryEnabled(),
  ignoreErrors: IGNORED_CLIENT_ERRORS,

  // Replay is added lazily (see below) so its bundle stays off the first-paint
  // critical path. Keep this empty here.
  integrations: [],

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  replaysOnErrorSampleRate: 0.1,

  replaysSessionSampleRate: 0,

  tracesSampleRate: TRACES_SAMPLE_RATE,
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
          blockAllMedia: false,
          maskAllText: false,
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
