import { Redis } from '@upstash/redis';

import { RATE_LIMIT_DEFAULT } from '@/lib/api/constants';

const redis = Redis.fromEnv();
const WINDOW_SECONDS = 60;

export interface RateLimitState {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
}

export async function consumeRateLimit(
  identifier: string,
): Promise<RateLimitState> {
  const now = Date.now();
  const windowStart = Math.floor(now / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  const key = `external_api:ratelimit:${identifier}:${windowStart}`;
  const limit = RATE_LIMIT_DEFAULT.requestsPerMinute;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  const remaining = Math.max(0, limit - count);
  const resetAt = new Date((windowStart + WINDOW_SECONDS) * 1000).toISOString();

  return {
    allowed: count <= limit,
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
