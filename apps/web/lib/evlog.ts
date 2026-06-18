import type { DrainContext } from 'evlog';
import { createAxiomDrain } from 'evlog/axiom';
import { createEvlog } from 'evlog/next';
import { createSentryDrain } from 'evlog/sentry';

/**
 * evlog wide-event logging for the Next.js app.
 *
 * Every request wrapped in `withEvlog()` builds a single structured "wide
 * event" that is fanned out to both Sentry (Explore > Logs) and Axiom.
 *
 * Server usage:
 *
 *   import { withEvlog, useLogger } from '@/lib/evlog';
 *
 *   export const POST = withEvlog(async (req) => {
 *     const log = useLogger();
 *     log.set({ action: 'speech', model: 'kokoro' });
 *     return Response.json({ ok: true });
 *   });
 *
 * Client usage for normalizing errors:
 *
 *   import { parseError } from 'evlog';
 *   const { message, status, why, fix } = parseError(error);
 */

export const SERVICE_NAME = 'sexyvoice';

// Same public Sentry DSN used by sentry.server.config.ts. Allow an env
// override so the drain can be pointed elsewhere without a code change.
const SENTRY_DSN =
  process.env.SENTRY_DSN ??
  'https://784d74949017ccfddf3df01f224e3e8b@o4509116858695680.ingest.de.sentry.io/4509116876193872';

const sentryDrain = createSentryDrain({ dsn: SENTRY_DSN });

// Reuse the existing AXIOM_TOKEN credential. The dataset defaults to the
// `vercel` dataset already used by lib/api/logger.ts; override with
// AXIOM_DATASET if evlog events should land in a dedicated dataset.
const axiomDrain = createAxiomDrain({
  apiKey: process.env.AXIOM_TOKEN ?? '',
  dataset: process.env.AXIOM_DATASET ?? 'vercel',
});

/**
 * Combined drain: send every emitted wide event to both Sentry and Axiom.
 * A failure in one drain must not block the other, so they run concurrently.
 */
export const drain = (ctx: DrainContext | DrainContext[]): Promise<void> =>
  Promise.all([sentryDrain(ctx), axiomDrain(ctx)]).then(() => undefined);

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: SERVICE_NAME,
  // Mirror the existing Sentry setup: only ship events from production.
  enabled: process.env.NODE_ENV === 'production',
  drain,
});
