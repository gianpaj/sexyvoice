import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { RATE_LIMIT_DEFAULT } from '@/lib/api/constants';

const redis = Redis.fromEnv();
const WINDOW_SECONDS = 60;
const WINDOW_DURATION = `${WINDOW_SECONDS} s` as const;
const BUCKET_MAX_SIZE = RATE_LIMIT_DEFAULT.requestsPerMinute;

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.tokenBucket(
    RATE_LIMIT_DEFAULT.requestsPerMinute,
    WINDOW_DURATION,
    BUCKET_MAX_SIZE,
  ),
  analytics: true,
  prefix: 'external_api:ratelimit',
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
  const limit = result.limit ?? RATE_LIMIT_DEFAULT.requestsPerMinute;
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
    limit: RATE_LIMIT_DEFAULT.requestsPerMinute,
    remaining: RATE_LIMIT_DEFAULT.requestsPerMinute,
    resetAt: new Date(Date.now() + WINDOW_SECONDS * 1000).toISOString(),
  };
}
