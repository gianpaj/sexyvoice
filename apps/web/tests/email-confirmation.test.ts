import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthCallbackMarkerValue } from '@/lib/supabase/auth-callback-marker';
import {
  createEmailConfirmation,
  matchesConfirmationCsrf,
  readEmailConfirmation,
} from '@/lib/supabase/email-confirmation';

const input = {
  tokenHash: 'opaque-token',
  type: 'email',
  locale: 'en',
  redirectPath: null,
} as const;
beforeEach(() => vi.stubEnv('OAUTH_CALLBACK_MARKER_SECRET', 'test-secret'));
afterEach(() => vi.unstubAllEnvs());

describe('pending email confirmation state', () => {
  it('signs bounded, expiring state with an unpredictable browser nonce', () => {
    const first = createEmailConfirmation(input, 1000)!;
    const second = createEmailConfirmation(input, 1000)!;
    expect(first.length).toBeLessThan(3001);
    expect(readEmailConfirmation(first, 1000)).toMatchObject(input);
    expect(readEmailConfirmation(first, 1000)?.csrf).not.toBe(
      readEmailConfirmation(second, 1000)?.csrf,
    );
    expect(readEmailConfirmation(first, 601_000)).toBeNull();
  });

  it('rejects oversized input instead of emitting a truncated cookie', () => {
    expect(
      createEmailConfirmation({ ...input, tokenHash: 'x'.repeat(513) }),
    ).toBeNull();
    expect(
      createEmailConfirmation({ ...input, redirectPath: '/'.repeat(1025) }),
    ).toBeNull();
    expect(
      createEmailConfirmation({
        ...input,
        tokenHash: '🎤'.repeat(512),
        redirectPath: `/${'x'.repeat(1000)}`,
      }),
    ).toBeNull();
    expect(readEmailConfirmation('x'.repeat(3001))).toBeNull();
  });

  it('rejects modified, malformed, and callback-marker signatures', () => {
    const state = createEmailConfirmation(input)!;
    const [payload, signature] = state.split('.');
    expect(readEmailConfirmation(`${payload}x.${signature}`)).toBeNull();
    expect(readEmailConfirmation(`${state}.`)).toBeNull();
    expect(readEmailConfirmation(`${payload}.wrong`)).toBeNull();
    expect(readEmailConfirmation(createAuthCallbackMarkerValue()!)).toBeNull();
    expect(readEmailConfirmation('not-json')).toBeNull();
  });

  it('fails closed when no signing key is configured', () => {
    vi.stubEnv('OAUTH_CALLBACK_MARKER_SECRET', '');
    vi.stubEnv('API_KEY_HMAC_SECRET', '');
    expect(createEmailConfirmation(input)).toBeNull();
  });

  it('accepts only the exact ASCII nonce', () => {
    const state = readEmailConfirmation(createEmailConfirmation(input)!)!;
    expect(matchesConfirmationCsrf(state.csrf, state.csrf)).toBe(true);
    expect(matchesConfirmationCsrf('é'.repeat(43), state.csrf)).toBe(false);
    expect(matchesConfirmationCsrf(null, state.csrf)).toBe(false);
  });
});
