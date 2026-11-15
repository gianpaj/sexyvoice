import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const WINDOW_SECONDS = 60;
const WINDOW_DURATION = `${WINDOW_SECONDS} s` as const;
const REQUESTS_PER_MINUTE = 60;

const ratelimit = new Ratelimit({
  analytics: true,
  limiter: Ratelimit.tokenBucket(
    REQUESTS_PER_MINUTE,
    WINDOW_DURATION,
    REQUESTS_PER_MINUTE,
  ),
  prefix: 'external_api:ratelimit',
  redis,
});

export interface RateLimitState {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
}

export async function consumeRateLimit(
  identifier: string,
): Promise<RateLimitState> {
  const result = await ratelimit.limit(identifier);
  const limit = result.limit ?? REQUESTS_PER_MINUTE;
  const remaining = Math.max(0, result.remaining ?? 0);
  const resetAt = new Date(result.reset ?? Date.now()).toISOString();

  return {
    allowed: result.success,
    limit,
    remaining,
    resetAt,
  };
}

export function createRateLimitHeaders(rateLimit: RateLimitState): Headers {
  const headers = new Headers();
  headers.set('X-RateLimit-Limit-Requests', rateLimit.limit.toString());
  headers.set('X-RateLimit-Remaining-Requests', rateLimit.remaining.toString());
  headers.set('X-RateLimit-Reset-Requests', rateLimit.resetAt);
  return headers;
}

export function createDefaultRateLimitState(): RateLimitState {
  return {
    allowed: true,
    limit: REQUESTS_PER_MINUTE,
    remaining: REQUESTS_PER_MINUTE,
    resetAt: new Date(Date.now() + WINDOW_SECONDS * 1000).toISOString(),
  };
}
