import { captureException, captureMessage } from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/auth/callback/route';
import {
  AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
  createAuthCallbackMarkerValue,
} from '@/lib/supabase/auth-callback-marker';
import { AUTH_CALLBACK_COOKIE_NAME } from '@/lib/supabase/constants';
import { createClient } from '@/lib/supabase/server';

const { responseCookieSetMock } = vi.hoisted(() => ({
  responseCookieSetMock: vi.fn(),
}));

vi.mock('@/lib/stripe/stripe-admin', () => ({
  createOrRetrieveCustomer: vi.fn().mockResolvedValue('cus_test'),
}));

vi.mock('@/lib/posthog', () => ({
  default: vi.fn(() => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: string | URL, init?: ResponseInit | number) => {
      const responseInit = typeof init === 'object' ? init : undefined;
      const response = new Response(null, {
        ...responseInit,
        status: typeof init === 'number' ? init : (responseInit?.status ?? 307),
        headers: {
          location: String(url),
        },
      }) as Response & {
        cookies: {
          set: typeof responseCookieSetMock;
        };
      };

      response.cookies = {
        set: responseCookieSetMock,
      };

      return response;
    },
  },
}));

describe('OAuth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('handles missing PKCE verifier errors without Sentry telemetry', async () => {
    const exchangeError = new Error('PKCE code verifier not found in storage.');
    exchangeError.name = 'AuthPKCECodeVerifierMissingError';
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: null },
      error: exchangeError,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { exchangeCodeForSession },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/callback?code=abc123&redirect_to=%2Fen%2Fdashboard',
        {
          headers: {
            cookie:
              'sb-test-auth-token=token; sv_auth_callback_ok=marker-value',
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/en/login',
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'OAuth callback missing PKCE code verifier.',
      {
        area: 'auth',
        errorType: 'pkce-code-verifier-missing',
        flow: 'oauth-callback',
        extra: expect.objectContaining({
          redirectTo: '/en/dashboard',
          locale: 'en',
          hasCode: true,
          codeLength: 6,
          hasCookieHeader: true,
          cookieCount: 2,
          supabaseCookieCount: 1,
          hasSupabaseAuthCookie: true,
          hasSupabaseCodeVerifierCookie: false,
          hasAuthCallbackMarkerCookie: true,
          errorMessage: 'PKCE code verifier not found in storage.',
        }),
      },
    );
    expect(responseCookieSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: AUTH_CALLBACK_COOKIE_NAME,
        maxAge: 0,
      }),
    );
  });

  it('does not emit production console warnings for expected PKCE verifier misses', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const exchangeError = new Error('PKCE code verifier not found in storage.');
    exchangeError.name = 'AuthPKCECodeVerifierMissingError';
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: null },
      error: exchangeError,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { exchangeCodeForSession },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/callback?code=abc123&redirect_to=%2Fen%2Fdashboard',
        {
          headers: {
            cookie: 'sb-test-auth-token=token',
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/en/login',
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(console.warn).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(responseCookieSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: AUTH_CALLBACK_COOKIE_NAME,
        maxAge: 0,
        secure: true,
      }),
    );
  });

  it('treats valid marked callbacks without a verifier as already completed', async () => {
    vi.stubEnv('API_KEY_HMAC_SECRET', 'test-secret');
    const marker = createAuthCallbackMarkerValue();

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/callback?code=abc123&redirect_to=%2Fen%2Fdashboard',
        {
          headers: {
            cookie: `${AUTH_CALLBACK_COOKIE_NAME}=${marker}; sb-test-auth-token=token`,
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/en/dashboard',
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(responseCookieSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: AUTH_CALLBACK_COOKIE_NAME,
        maxAge: AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
      }),
    );
  });

  it('keeps unexpected exchange failures as exceptions with cookie context', async () => {
    const exchangeError = new Error('Unexpected auth exchange failure');
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: null },
      error: exchangeError,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { exchangeCodeForSession },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/callback?code=abc123&redirect_to=%2Fen%2Fdashboard',
        {
          headers: {
            cookie:
              'sb-test-auth-token=token; sb-test-auth-token-code-verifier=verifier',
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/en/login',
    );
    expect(captureMessage).not.toHaveBeenCalledWith(
      'OAuth callback missing PKCE code verifier.',
      expect.anything(),
    );
    expect(captureException).toHaveBeenCalledWith(
      exchangeError,
      expect.objectContaining({
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
        },
        extra: expect.objectContaining({
          hasSupabaseAuthCookie: true,
          hasSupabaseCodeVerifierCookie: true,
          supabaseCookieCount: 2,
        }),
      }),
    );
  });

  it('handles expired auth flow state errors without Sentry telemetry', async () => {
    const exchangeError = new Error(
      'invalid flow state, flow state has expired',
    );
    exchangeError.name = 'AuthApiError';
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: null },
      error: exchangeError,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { exchangeCodeForSession },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/callback?code=abc123&redirect_to=%2Fes%2Fdashboard',
        {
          headers: {
            cookie:
              'sb-test-auth-token=token; sb-test-auth-token-code-verifier=verifier',
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/es/login',
    );
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'OAuth callback flow state expired.',
      {
        area: 'auth',
        errorType: 'flow-state-expired',
        flow: 'oauth-callback',
        extra: expect.objectContaining({
          errorMessage: 'invalid flow state, flow state has expired',
          hasSupabaseCodeVerifierCookie: true,
          locale: 'es',
          redirectTo: '/es/dashboard',
        }),
      },
    );
  });

  it('handles typed expired auth flow state errors without Sentry telemetry', async () => {
    const exchangeError = Object.assign(
      new Error('OAuth flow is no longer valid'),
      {
        code: 'flow_state_expired',
        name: 'AuthApiError',
      },
    );
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: null },
      error: exchangeError,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { exchangeCodeForSession },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request('https://sexyvoice.ai/auth/callback?code=abc123', {
        headers: {
          cookie:
            'sb-test-auth-token=token; sb-test-auth-token-code-verifier=verifier',
        },
      }),
    );

    expect(response.status).toBe(307);
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'OAuth callback flow state expired.',
      {
        area: 'auth',
        errorType: 'flow-state-expired',
        flow: 'oauth-callback',
        extra: expect.objectContaining({
          errorName: 'AuthApiError',
        }),
      },
    );
  });

  it('handles code challenge mismatch errors without Sentry telemetry', async () => {
    const exchangeError = Object.assign(
      new Error('code challenge does not match previously saved code verifier'),
      { name: 'AuthApiError' },
    );
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: null },
      error: exchangeError,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { exchangeCodeForSession },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/callback?code=abc123&redirect_to=%2Fen%2Fdashboard',
        {
          headers: {
            cookie:
              'sb-test-auth-token=token; sb-test-auth-token-code-verifier=verifier',
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/en/login',
    );
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'OAuth callback code challenge mismatch.',
      {
        area: 'auth',
        errorType: 'code-challenge-mismatch',
        flow: 'oauth-callback',
        extra: expect.objectContaining({
          errorName: 'AuthApiError',
          hasSupabaseCodeVerifierCookie: true,
          locale: 'en',
        }),
      },
    );
  });
});
