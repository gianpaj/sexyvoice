import type { ErrorEvent } from '@sentry/nextjs';

export const CANCELLED_CHARGE_FLOW =
  'generation-charge-retained-after-cancellation';

// The SDK's own uploads to Sentry ingest. The transport suppresses tracing for
// them, but that depends on a single @opentelemetry/api copy (see the override
// in pnpm-workspace.yaml). This only keeps them out of Sentry's span quota;
// Dash0 (the 'auto' OTLP processor) still relies on the override.
export const ignoredServerSpans = [
  {
    name: /^(?:[A-Z]+ )?https?:\/\/[^/?#]+\.sentry\.io\/api\/\d+\/envelope\//,
    op: 'http.client',
  },
];

export function sanitizeServerEvent(event: ErrorEvent): ErrorEvent {
  if (event.tags?.flow !== CANCELLED_CHARGE_FLOW) return event;

  // SDK request enrichment can attach the transcript after captureMessage runs.
  return {
    ...event,
    breadcrumbs: undefined,
    contexts: undefined,
    extra: {
      creditsDebited: event.extra?.creditsDebited,
      model: event.extra?.model,
    },
    request: undefined,
    tags: { flow: CANCELLED_CHARGE_FLOW, transport: event.tags?.transport },
    user: event.user?.id ? { id: event.user.id } : undefined,
  };
}
