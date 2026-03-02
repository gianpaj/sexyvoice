import { RATE_LIMIT_DEFAULT } from '@/lib/api/constants';

export function createRateLimitHeaders(): Headers {
  const headers = new Headers();
  const reset = new Date(Date.now() + 60_000).toISOString();
  headers.set(
    'X-RateLimit-Limit-Requests',
    RATE_LIMIT_DEFAULT.requestsPerMinute.toString(),
  );
  headers.set(
    'X-RateLimit-Remaining-Requests',
    RATE_LIMIT_DEFAULT.requestsPerMinute.toString(),
  );
  headers.set('X-RateLimit-Reset-Requests', reset);
  return headers;
}
