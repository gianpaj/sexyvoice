import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createOauthCallbackMarkerValue,
  OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
  verifyOauthCallbackMarkerValue,
} from '@/lib/supabase/oauth-callback-marker';

describe('oauth callback marker', () => {
  const originalSecret = process.env.API_KEY_HMAC_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.API_KEY_HMAC_SECRET;
    } else {
      process.env.API_KEY_HMAC_SECRET = originalSecret;
    }
    vi.restoreAllMocks();
  });

  it('creates a verifiable marker value', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const now = Date.now();
    const marker = createOauthCallbackMarkerValue(now);

    expect(marker).not.toBeNull();
    expect(verifyOauthCallbackMarkerValue(marker ?? undefined, now)).toBe(true);
  });

  it('uses the configured max age when generating the marker expiry', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const now = 1_700_000_000_000;
    const marker = createOauthCallbackMarkerValue(now);

    expect(marker).not.toBeNull();

    const [rawExpiresAt] = (marker ?? '').split('.');
    expect(Number(rawExpiresAt)).toBe(
      now + OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS * 1000,
    );
  });

  it('rejects expired marker values', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const now = 1_700_000_000_000;
    const marker = createOauthCallbackMarkerValue(now);

    expect(marker).not.toBeNull();
    expect(
      verifyOauthCallbackMarkerValue(
        marker ?? undefined,
        now + OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS * 1000 + 1,
      ),
    ).toBe(false);
  });

  it('rejects tampered signatures', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const marker = createOauthCallbackMarkerValue(1_700_000_000_000);
    expect(marker).not.toBeNull();

    const [expiresAt, signature] = (marker ?? '').split('.');
    const tamperedSignature = `${signature.slice(0, -1)}${
      signature.endsWith('0') ? '1' : '0'
    }`;

    expect(
      verifyOauthCallbackMarkerValue(
        `${expiresAt}.${tamperedSignature}`,
        1_700_000_000_000,
      ),
    ).toBe(false);
  });

  it('rejects malformed marker values with extra segments', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const marker = createOauthCallbackMarkerValue(1_700_000_000_000);
    expect(marker).not.toBeNull();

    expect(
      verifyOauthCallbackMarkerValue(`${marker}.extra`, 1_700_000_000_000),
    ).toBe(false);
  });

  it('returns null when the marker secret is unavailable', () => {
    delete process.env.API_KEY_HMAC_SECRET;

    const marker = createOauthCallbackMarkerValue(1_700_000_000_000);

    expect(marker).toBeNull();
  });

  it('returns false when verifying without a marker secret', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';
    const marker = createOauthCallbackMarkerValue(1_700_000_000_000);

    delete process.env.API_KEY_HMAC_SECRET;

    expect(
      verifyOauthCallbackMarkerValue(marker ?? undefined, 1_700_000_000_000),
    ).toBe(false);
  });

  it('returns false for missing marker values', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    expect(verifyOauthCallbackMarkerValue(undefined, Date.now())).toBe(false);
  });
});
