let postHogInitPromise: ReturnType<typeof loadPostHog> | null = null;

function loadPostHog() {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return Promise.resolve(null);
  }

  return Promise.all([
    import('posthog-js/dist/module.slim'),
    import('posthog-js/dist/extension-bundles'),
  ])
    .then(
      ([
        { default: posthog },
        { AnalyticsExtensions, SessionReplayExtensions },
      ]) => {
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
          __extensionClasses: {
            ...SessionReplayExtensions,
            ...AnalyticsExtensions,
          },
          api_host: '/seguimiento',
          defaults: '2026-01-30',
          ui_host: 'https://eu.posthog.com',
        });

        return posthog;
      },
    )
    .catch((error) => {
      postHogInitPromise = null;
      console.error('Failed to initialize PostHog:', error);
      return null;
    });
}

export function initPostHog() {
  postHogInitPromise ??= loadPostHog();
  return postHogInitPromise;
}
