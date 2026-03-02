import { NextResponse } from 'next/server';

import {
  createDefaultRateLimitState,
  createRateLimitHeaders,
  type RateLimitState,
} from '@/lib/api/rate-limit';

export function jsonWithRateLimitHeaders(
  body: unknown,
  init: ResponseInit = {},
  rateLimit?: RateLimitState,
): NextResponse {
  const response = NextResponse.json(body, init);
  const rateHeaders = createRateLimitHeaders(
    rateLimit ?? createDefaultRateLimitState(),
  );
  for (const [key, value] of rateHeaders.entries()) {
    response.headers.set(key, value);
  }
  return response;
}
