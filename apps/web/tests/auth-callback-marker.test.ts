import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
  createAuthCallbackMarkerValue,
  verifyAuthCallbackMarkerValue,
} from '@/lib/supabase/auth-callback-marker';

describe('auth callback marker', () => {
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
    const marker = createAuthCallbackMarkerValue(now);

    expect(marker).not.toBeNull();
    expect(verifyAuthCallbackMarkerValue(marker ?? undefined, now)).toBe(true);
  });

  it('uses the configured max age when generating the marker expiry', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const now = 1_700_000_000_000;
    const marker = createAuthCallbackMarkerValue(now);

    expect(marker).not.toBeNull();

    const [rawExpiresAt] = (marker ?? '').split('.');
    expect(Number(rawExpiresAt)).toBe(
      now + AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS * 1000,
    );
  });

  it('rejects expired marker values', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const now = 1_700_000_000_000;
    const marker = createAuthCallbackMarkerValue(now);

    expect(marker).not.toBeNull();
    expect(
      verifyAuthCallbackMarkerValue(
        marker ?? undefined,
        now + AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS * 1000 + 1,
      ),
    ).toBe(false);
  });

  it('rejects tampered signatures', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const marker = createAuthCallbackMarkerValue(1_700_000_000_000);
    expect(marker).not.toBeNull();

    const [expiresAt, signature] = (marker ?? '').split('.');
    const tamperedSignature = `${signature.slice(0, -1)}${
      signature.endsWith('0') ? '1' : '0'
    }`;

    expect(
      verifyAuthCallbackMarkerValue(
        `${expiresAt}.${tamperedSignature}`,
        1_700_000_000_000,
      ),
    ).toBe(false);
  });

  it('rejects malformed marker values with extra segments', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    const marker = createAuthCallbackMarkerValue(1_700_000_000_000);
    expect(marker).not.toBeNull();

    expect(
      verifyAuthCallbackMarkerValue(`${marker}.extra`, 1_700_000_000_000),
    ).toBe(false);
  });

  it('returns null when the marker secret is unavailable', () => {
    delete process.env.API_KEY_HMAC_SECRET;

    const marker = createAuthCallbackMarkerValue(1_700_000_000_000);

    expect(marker).toBeNull();
  });

  it('returns false when verifying without a marker secret', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';
    const marker = createAuthCallbackMarkerValue(1_700_000_000_000);

    delete process.env.API_KEY_HMAC_SECRET;

    expect(
      verifyAuthCallbackMarkerValue(marker ?? undefined, 1_700_000_000_000),
    ).toBe(false);
  });

  it('returns false for missing marker values', () => {
    process.env.API_KEY_HMAC_SECRET = 'test-secret';

    expect(verifyAuthCallbackMarkerValue(undefined, Date.now())).toBe(false);
  });
});
