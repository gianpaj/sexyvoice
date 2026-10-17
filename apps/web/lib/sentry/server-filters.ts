import type { ErrorEvent } from '@sentry/nextjs';

export const CANCELLED_CHARGE_FLOW =
  'generation-charge-retained-after-cancellation';

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
