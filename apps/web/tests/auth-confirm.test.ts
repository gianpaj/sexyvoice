import { captureException } from '@sentry/nextjs';
import { createClient as createIsolatedClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '@/app/auth/confirm/route';
import { recordSignupSideEffects } from '@/lib/auth/signup-side-effects';
import {
  createEmailConfirmation,
  EMAIL_CONFIRMATION_COOKIE,
  readEmailConfirmation,
} from '@/lib/supabase/email-confirmation';
import { createClient } from '@/lib/supabase/server';
import messages from '@/messages/en.json';

const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
}));
vi.mock('next/server', async (original) => original());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: mocks.cookies.get(name) }),
  }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: keyof typeof messages.auth.confirm) =>
    messages.auth.confirm[key],
}));
vi.mock('@supabase/supabase-js', async (original) => ({
  ...(await original<typeof import('@supabase/supabase-js')>()),
  createClient: vi.fn(() => ({ auth: { verifyOtp: mocks.verifyOtp } })),
}));
vi.mock('@/lib/auth/signup-side-effects', () => ({
  recordSignupSideEffects: vi.fn().mockResolvedValue(undefined),
}));

const user = { id: 'confirmed-user', email: 'user@example.com' };
const session = {
  user,
  access_token: 'new-access',
  refresh_token: 'new-refresh',
};
const browserSession = 'existing-account-session';
const origin = 'https://sexyvoice.ai';
const pending = (overrides = {}) => {
  const value = createEmailConfirmation({
    tokenHash: 'one-time-token',
    type: 'email',
    locale: 'en',
    redirectPath: null,
    ...overrides,
  })!;
  mocks.cookies.set(EMAIL_CONFIRMATION_COOKIE, value);
  return readEmailConfirmation(value)!;
};
const postRequest = (
  csrf: string | null,
  options: { origin?: string | null; email?: string; intent?: string } = {},
) => {
  const body = new URLSearchParams({
    email: options.email ?? user.email,
    intent: options.intent ?? 'confirm',
  });
  if (csrf !== null) body.set('csrf', csrf);
  const headers = new Headers();
  if (options.origin !== null) headers.set('origin', options.origin ?? origin);
  return new Request(`${origin}/auth/confirm`, {
    method: 'POST',
    headers,
    body,
  });
};
const expectSessionUntouched = (expectedSession = browserSession) => {
  expect(createClient).not.toHaveBeenCalled();
  expect(mocks.setSession).not.toHaveBeenCalled();
  expect(mocks.cookies.get('browser_session')).toBe(expectedSession);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OAUTH_CALLBACK_MARKER_SECRET', 'test-secret');
  mocks.cookies.clear();
  mocks.cookies.set('browser_session', browserSession);
  mocks.verifyOtp.mockResolvedValue({ data: { user, session }, error: null });
  mocks.setSession.mockImplementation(async () => {
    mocks.cookies.set('browser_session', 'confirmed-account-session');
    return { data: { session }, error: null };
  });
  vi.mocked(createClient).mockImplementation(async (headers) => {
    headers?.set('expires', '0');
    return { auth: { setSession: mocks.setSession } } as unknown as Awaited<
      ReturnType<typeof createClient>
    >;
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('email confirmation GET', () => {
  it('parks a link without verifying or installing its session and strips the URL', async () => {
    const response = await GET(
      new Request(
        `${origin}/auth/confirm?token_hash=one-time-token&type=email`,
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('location')).toBe(`${origin}/auth/confirm`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
    expect(response.cookies.getAll()).toHaveLength(1);
    const value = response.cookies.get(EMAIL_CONFIRMATION_COOKIE)!.value;
    expect(readEmailConfirmation(value)?.tokenHash).toBe('one-time-token');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(createIsolatedClient).not.toHaveBeenCalled();
    expectSessionUntouched();
  });

  it('renders browser-bound consent without token hashes or existing account details', async () => {
    const state = pending();
    const response = await GET(new Request(`${origin}/auth/confirm`));
    const html = await response.text();
    expect(html).toContain('method="post"');
    expect(html).toContain(state.csrf);
    expect(html).toContain('name="email"');
    expect(html).toContain('name="intent"');
    expect(html).not.toContain('one-time-token');
    expect(html).not.toContain(browserSession);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expectSessionUntouched();
  });

  it.each(['?type=email', '?token_hash=x&type=sms', '?token_hash=x', ''])(
    'rejects a missing or malformed link %s',
    async (query) => {
      const response = await GET(new Request(`${origin}/auth/confirm${query}`));
      expect(response.headers.get('location')).toBe(`${origin}/en/login`);
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expectSessionUntouched();
    },
  );

  it('rejects oversized state before emitting a cookie', async () => {
    const response = await GET(
      new Request(
        `${origin}/auth/confirm?token_hash=${'a'.repeat(600)}&type=email`,
      ),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('preserves locale hints for legacy links without an email address', async () => {
    const response = await GET(
      new Request(`${origin}/auth/confirm?token_hash=hash&type=recovery`, {
        headers: { 'accept-language': 'es-ES' },
      }),
    );
    expect(
      readEmailConfirmation(
        response.cookies.get(EMAIL_CONFIRMATION_COOKIE)?.value,
      )?.locale,
    ).toBe('es');
  });
});

describe('email confirmation POST', () => {
  it.each([
    null,
    'null',
    'https://evil.example',
    'http://sexyvoice.ai',
    'https://sexyvoice.ai.evil.example',
  ])(
    'rejects Origin %s before OTP or cookie mutation',
    async (requestOrigin) => {
      const state = pending();
      const response = await POST(
        postRequest(state.csrf, { origin: requestOrigin }),
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expectSessionUntouched();
    },
  );

  it.each([null, 'wrong', 'x'.repeat(43), 'é'.repeat(43)])(
    'rejects invalid CSRF %s before OTP or cookie mutation',
    async (csrf) => {
      pending();
      const response = await POST(postRequest(csrf));
      expect(response.status).toBe(403);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expectSessionUntouched();
    },
  );

  it('rejects a missing consent choice', async () => {
    const state = pending();
    const response = await POST(postRequest(state.csrf, { intent: '' }));
    expect(response.status).toBe(403);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expectSessionUntouched();
  });

  it('rejects expired pending state without changing the browser session', async () => {
    vi.useFakeTimers();
    const state = pending();
    vi.advanceTimersByTime(601_000);
    const response = await POST(postRequest(state.csrf));
    expect(response.status).toBe(403);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expectSessionUntouched();
  });

  it('verifies in a plain nonpersistent client and installs only the confirmed identity', async () => {
    const state = pending();
    const response = await POST(
      postRequest(state.csrf, { email: 'USER@example.com' }),
    );
    expect(createIsolatedClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'one-time-token',
      type: 'email',
    });
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${origin}/en/dashboard`);
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.cookies.get('sv_auth_callback_ok')?.value).toBeTruthy();
    expect(response.cookies.get(EMAIL_CONFIRMATION_COOKIE)?.maxAge).toBe(0);
    expect(recordSignupSideEffects).toHaveBeenCalledWith(user, 'email');
    expect(mocks.cookies.get('browser_session')).toBe(
      'confirmed-account-session',
    );
  });

  it('rejects an attacker account labeled with the victim email before setSession', async () => {
    const state = pending();
    mocks.verifyOtp.mockResolvedValueOnce({
      data: {
        user,
        session: {
          ...session,
          user: { ...user, email: 'attacker@example.com' },
        },
      },
      error: null,
    });
    const response = await POST(postRequest(state.csrf));
    expect(response.status).toBe(400);
    expect(response.cookies.getAll().map(({ name }) => name)).toEqual([
      EMAIL_CONFIRMATION_COOKIE,
    ]);
    expectSessionUntouched();
    expect(recordSignupSideEffects).not.toHaveBeenCalled();
  });

  it('rejects a repeated browser submission after pending state is consumed', async () => {
    const state = pending();
    const response = await POST(postRequest(state.csrf));
    expect(response.cookies.get(EMAIL_CONFIRMATION_COOKIE)?.maxAge).toBe(0);
    mocks.cookies.delete(EMAIL_CONFIRMATION_COOKIE);
    vi.mocked(createClient).mockClear();
    mocks.setSession.mockClear();
    const repeated = await POST(postRequest(state.csrf));
    expect(repeated.status).toBe(403);
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expectSessionUntouched('confirmed-account-session');
  });

  it.each([
    'signup',
    'invite',
    'magiclink',
    'recovery',
    'email_change',
    'email',
  ] as const)(
    'supports cross-browser %s links without PKCE state',
    async (type) => {
      mocks.cookies.delete('browser_session');
      const state = pending({ type, locale: 'es' });
      const response = await POST(postRequest(state.csrf));
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(
        `${origin}/es/${type === 'recovery' ? 'protected/update-password' : 'dashboard'}`,
      );
      expect(mocks.setSession).toHaveBeenCalledOnce();
    },
  );

  it('acknowledges a successful sessionless email change without reading or installing an existing session', async () => {
    const state = pending({ type: 'email_change' });
    mocks.verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: null,
    });
    const response = await POST(postRequest(state.csrf));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      messages.auth.confirm.emailChangeConfirmed,
    );
    expectSessionUntouched();
    expect(recordSignupSideEffects).not.toHaveBeenCalled();
  });

  it.each([null, new Error('Invalid OTP')])(
    'does not install a missing or failed session %s',
    async (error) => {
      const state = pending();
      mocks.verifyOtp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error,
      });
      const response = await POST(postRequest(state.csrf));
      expect(response.status).toBe(400);
      expectSessionUntouched();
    },
  );

  it('keeps the confirmed redirect when signup side effects fail', async () => {
    const state = pending({
      redirectPath: '/fr/dashboard?source=email#billing',
    });
    const error = new Error('Provisioning unavailable');
    vi.mocked(recordSignupSideEffects).mockRejectedValueOnce(error);
    const response = await POST(postRequest(state.csrf));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `${origin}/fr/dashboard?source=email#billing`,
    );
    expect(captureException).toHaveBeenCalledWith(error, expect.any(Object));
  });

  it('sanitizes even a signed external destination before redirecting', async () => {
    const state = pending({
      redirectPath: 'https://evil.example',
      locale: 'es',
    });
    const response = await POST(postRequest(state.csrf));
    expect(response.headers.get('location')).toBe(`${origin}/es/dashboard`);
  });
});
