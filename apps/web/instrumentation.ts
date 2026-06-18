import * as Sentry from '@sentry/nextjs';
import { defineNodeInstrumentation } from 'evlog/next/instrumentation';

import { drain, SERVICE_NAME } from './lib/evlog';

// evlog startup + unhandled-error hooks (Node.js runtime only). Captures
// SSR/RSC errors that happen outside a `withEvlog()` wrapper and forwards
// stdout/stderr as structured output. Shares the Sentry + Axiom drain.
const evlog = defineNodeInstrumentation({
  service: SERVICE_NAME,
  captureOutput: true,
  drain,
});

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }

  await evlog.register();
}

export const onRequestError: typeof Sentry.captureRequestError = async (
  ...args
) => {
  Sentry.captureRequestError(...args);
  await evlog.onRequestError(
    args[0] as never,
    args[1] as never,
    args[2] as never,
  );
};
