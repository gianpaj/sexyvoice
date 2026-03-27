import { captureException, logger } from '@sentry/nextjs';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createChallenge } from 'altcha-lib';
import { NextResponse } from 'next/server';

const DEFAULT_MAX_NUMBER = 50_000;
const DEFAULT_EXPIRES_IN_MS = 5 * 60 * 1000; // 5 minutes
const CHALLENGE_RATE_LIMIT = 30;
const CHALLENGE_RATE_LIMIT_WINDOW = '1 m' as const;

const redis = Redis.fromEnv();
const challengeRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(
    CHALLENGE_RATE_LIMIT,
    CHALLENGE_RATE_LIMIT_WINDOW,
  ),
  analytics: true,
  prefix: 'altcha_challenge',
});

export async function GET(request: Request) {
  const hmacKey = process.env.ALTCHA_HMAC_KEY;

  if (!hmacKey) {
    return NextResponse.json(
      { error: 'ALTCHA_HMAC_KEY is not configured' },
      { status: 500 },
    );
  }

  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '0.0.0.0';
    const rateLimit = await challengeRatelimit.limit(ip);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 },
      );
    }

    const challenge = await createChallenge({
      hmacKey,
      maxnumber: DEFAULT_MAX_NUMBER,
      expires: new Date(Date.now() + DEFAULT_EXPIRES_IN_MS),
    });

    return NextResponse.json(challenge, {
      status: 200,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (err) {
    captureException(err, { extra: { context: 'altcha-challenge' } });
    logger.error('Failed to generate Altcha challenge', { error: err });
    return NextResponse.json(
      { error: 'Failed to generate Altcha challenge' },
      { status: 500 },
    );
  }
}
