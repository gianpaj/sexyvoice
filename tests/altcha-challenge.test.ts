import { beforeEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/altcha/challenge/route';
import { mockCreateChallenge, mockRatelimitLimit } from './setup';

function makeRequest() {
  return new Request('http://localhost/api/altcha/challenge', {
    headers: {
      'x-forwarded-for': '203.0.113.10',
    },
  });
}

describe('/api/altcha/challenge', () => {
  beforeEach(() => {
    process.env.ALTCHA_HMAC_KEY = 'test-altcha-key';
    mockCreateChallenge.mockReset().mockResolvedValue({
      algorithm: 'SHA-256',
      challenge: 'test-challenge',
      maxnumber: 50_000,
      salt: 'test-salt',
      signature: 'test-signature',
    });
    mockRatelimitLimit.mockReset().mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
    });
  });

  it('returns 500 when ALTCHA_HMAC_KEY is missing', async () => {
    process.env.ALTCHA_HMAC_KEY = '';

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'ALTCHA_HMAC_KEY is not configured' });
  });

  it('returns a challenge with cache-busting headers', async () => {
    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      algorithm: 'SHA-256',
      challenge: 'test-challenge',
      maxnumber: 50_000,
      salt: 'test-salt',
      signature: 'test-signature',
    });
    expect(response.headers.get('Cache-Control')).toBe(
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    expect(response.headers.get('Pragma')).toBe('no-cache');
    expect(response.headers.get('Expires')).toBe('0');
  });

  it('returns 429 when challenge generation is rate limited', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json).toEqual({ error: 'Rate limit exceeded' });
  });
});
