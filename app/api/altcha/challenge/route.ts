import { createChallenge } from 'altcha-lib';
import { NextResponse } from 'next/server';

const DEFAULT_MAX_NUMBER = 50_000;
const DEFAULT_EXPIRES_IN_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const hmacKey = process.env.ALTCHA_HMAC_KEY;

  if (!hmacKey) {
    return NextResponse.json(
      { error: 'ALTCHA_HMAC_KEY is not configured' },
      { status: 500 },
    );
  }

  try {
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
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate Altcha challenge' },
      { status: 500 },
    );
  }
}
