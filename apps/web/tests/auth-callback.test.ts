import { captureException, captureMessage } from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/auth/callback/route';
import { createClient } from '@/lib/supabase/server';

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
      return new Response(null, {
        ...responseInit,
        status: typeof init === 'number' ? init : (responseInit?.status ?? 307),
        headers: {
          location: String(url),
        },
      });
    },
  },
}));

describe('OAuth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downgrades missing PKCE verifier errors to warning telemetry', async () => {
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
    expect(captureMessage).toHaveBeenCalledWith(
      'OAuth callback missing PKCE code verifier.',
      expect.objectContaining({
        level: 'warning',
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
          error_type: 'pkce-code-verifier-missing',
        },
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
});
