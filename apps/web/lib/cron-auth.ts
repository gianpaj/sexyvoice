import { captureMessage } from '@sentry/nextjs';

import { APIErrorResponse } from '@/lib/error-ts';

/**
 * Checks the `Authorization: Bearer $CRON_SECRET` header that Vercel cron
 * sends. Returns the response to send for a rejected request, or null when the
 * request may run.
 *
 * Production fails closed when the secret is unset: otherwise a literal
 * `Bearer undefined` would match and anyone could run the job. Local
 * development skips the check.
 */
export function rejectUnauthorizedCron(request: Request) {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    captureMessage('CRON_SECRET is not configured');
    return APIErrorResponse('Server misconfigured', 500);
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return APIErrorResponse('Unauthorized', 401);
  }

  return null;
}
