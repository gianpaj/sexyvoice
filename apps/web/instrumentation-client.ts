// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

import { shouldDropClientSentryEvent } from '@/lib/sentry/client-filters';
import { routing } from '@/src/i18n/routing';

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
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

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
  // biome-ignore lint/nursery/noFloatingPromises: it's fine
  import('@sentry/nextjs').then((lazySentry) => {
    Sentry.addIntegration(
      lazySentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    );
  });
}

// Defer PostHog so analytics + session-replay code is fetched and initialised in
// a separate async chunk during browser idle time, keeping it off the critical
// path of first paint (important on the marketing/landing page). Interaction
// events fire after load, so the small delay before init has no practical impact.
function initPostHog() {
  // biome-ignore lint/nursery/noFloatingPromises: it's fine
  Promise.all([
    import('posthog-js/dist/module.slim'),
    import('posthog-js/dist/extension-bundles'),
  ]).then(
    ([
      { default: posthog },
      { AnalyticsExtensions, SessionReplayExtensions },
    ]) => {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: '/seguimiento',
        ui_host: 'https://eu.posthog.com',
        defaults: '2026-01-30',
        __extensionClasses: {
          ...SessionReplayExtensions,
          ...AnalyticsExtensions,
        },
      });
    },
  );
}

// The marketing/landing page is the `[lang]` root: `/` or `/<locale>` with
// nothing after it. We skip PostHog there to keep it off that page entirely.
// Caveat: instrumentation runs once per full page load, so if the visitor's
// entry URL is the landing page, PostHog stays uninitialised for the rest of
// their (client-side navigated) session.
function isLandingPage(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return (
    segments.length === 0 ||
    (segments.length === 1 && routing.locales.includes(segments[0] as never))
  );
}

if (typeof window !== 'undefined') {
  // Replay loads on every route so error sessions are captured everywhere.
  runWhenIdle(initSentryReplay);

  // PostHog is skipped on the landing page (see note above).
  if (!isLandingPage(window.location.pathname)) {
    runWhenIdle(initPostHog);
  }
}
