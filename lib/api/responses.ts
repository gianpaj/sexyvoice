import { NextResponse } from 'next/server';

import { createRateLimitHeaders } from '@/lib/api/rate-limit';

export function jsonWithRateLimitHeaders(
  body: unknown,
  init: ResponseInit = {},
): NextResponse {
  const response = NextResponse.json(body, init);
  const rateHeaders = createRateLimitHeaders();
  for (const [key, value] of rateHeaders.entries()) {
    response.headers.set(key, value);
  }
  return response;
}
