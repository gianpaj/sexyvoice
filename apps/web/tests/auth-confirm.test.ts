import { captureException, captureMessage } from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/auth/confirm/route';
import { createClient } from '@/lib/supabase/server';

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
      });

      return Object.assign(response, {
        cookies: {
          set: vi.fn(
            ({
              maxAge,
              name,
              path,
              value,
            }: {
              maxAge: number;
              name: string;
              path: string;
              value: string;
            }) => {
              response.headers.append(
                'set-cookie',
                `${name}=${value}; Max-Age=${maxAge}; Path=${path}`,
              );
            },
          ),
        },
      });
    },
  },
}));

describe('Email auth confirm route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies token_hash links and redirects to a same-origin destination', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-id', email: 'user@example.com' } },
      error: null,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { verifyOtp },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/confirm?token_hash=pkce_hash&type=email&redirect_to=https%3A%2F%2Fsexyvoice.ai%2Fes%2Fdashboard%3Fsource%3Demail',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/es/dashboard?source=email',
    );
    expect(response.headers.get('set-cookie')).toContain(
      'sv_oauth_callback_ok=',
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'pkce_hash',
      type: 'email',
    });
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('falls back to the default dashboard for unsafe redirect destinations', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-id', email: 'user@example.com' } },
      error: null,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { verifyOtp },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/confirm?token_hash=pkce_hash&type=email&redirect_to=https%3A%2F%2Fevil.example%2Fdashboard',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/en/dashboard',
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'pkce_hash',
      type: 'email',
    });
  });

  it('reports malformed confirmation links without calling Supabase', async () => {
    const response = await GET(
      new Request('https://sexyvoice.ai/auth/confirm?type=email'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/en/login',
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      'Email auth confirmation link missing required parameters.',
      expect.objectContaining({
        level: 'warning',
        tags: {
          area: 'auth',
          flow: 'email-auth-confirm',
          error_type: 'missing-confirmation-params',
        },
        extra: expect.objectContaining({
          hasTokenHash: false,
          type: 'email',
        }),
      }),
    );
  });

  it('reports verifyOtp failures and returns users to localized login', async () => {
    const verifyError = new Error('Token has expired or is invalid');
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: null },
      error: verifyError,
    });

    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { verifyOtp },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new Request(
        'https://sexyvoice.ai/auth/confirm?token_hash=expired&type=recovery&redirect_to=%2Ffr%2Fprotected%2Fupdate-password',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/fr/login',
    );
    expect(captureException).toHaveBeenCalledWith(
      verifyError,
      expect.objectContaining({
        tags: {
          area: 'auth',
          flow: 'email-auth-confirm',
          error_type: 'verify-otp-failed',
        },
        extra: expect.objectContaining({
          type: 'recovery',
          safeRedirectPath: '/fr/protected/update-password',
        }),
      }),
    );
  });
});
