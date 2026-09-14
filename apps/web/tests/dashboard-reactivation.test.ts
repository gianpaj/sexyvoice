import { captureException } from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureUserApplicationState } from '@/lib/supabase/ensure-user-application-state';
import { createMiddlewareClient } from '@/lib/supabase/middleware-client';
import { updateSession } from '@/lib/supabase/proxy';

vi.mock('@/lib/supabase/middleware-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/supabase/middleware-client')
  >()),
  createMiddlewareClient: vi.fn(),
}));

const getUser = vi.hoisted(() => vi.fn());

const nextResponseMocks = vi.hoisted(() => {
  const createResponse = (location?: string) => ({
    cookies: {
      getAll: vi.fn(() => []),
      set: vi.fn(),
    },
    headers: new Headers(location ? { location } : undefined),
  });

  return {
    createResponse,
    next: vi.fn(() => createResponse()),
    redirect: vi.fn((url: URL) => createResponse(url.toString())),
  };
});

vi.mock('next/server', () => ({
  NextResponse: {
    next: nextResponseMocks.next,
    redirect: nextResponseMocks.redirect,
  },
}));

vi.mock('@/lib/e2e-mode', () => ({
  isE2E: vi.fn(() => false),
}));

vi.mock('@/lib/supabase/ensure-user-application-state', () => ({
  ensureUserApplicationState: vi.fn(),
}));

vi.mock('@/lib/supabase/oauth-callback-marker', () => ({
  verifyOauthCallbackMarkerValue: vi.fn(() => false),
}));

function createRequest(pathname: string) {
  const url = `https://sexyvoice.ai${pathname}`;

  return {
    cookies: { get: vi.fn(() => undefined) },
    nextUrl: new URL(url),
    url,
  } as unknown as NextRequest;
}

describe('dashboard inactive-user reactivation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(createMiddlewareClient).mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'returning-user-id' } },
          error: null,
        }),
        getUser: getUser.mockResolvedValue({
          data: {
            user: {
              created_at: '2025-08-29T11:38:46.727Z',
              email: 'returning@example.com',
              id: 'returning-user-id',
            },
          },
          error: null,
        }),
      },
    } as never);
  });

  it('completes restoration before allowing the dashboard request through', async () => {
    let finishRestoration: () => void = () => undefined;
    const restorationPending = new Promise<'restored'>((resolve) => {
      finishRestoration = () => resolve('restored');
    });
    vi.mocked(ensureUserApplicationState).mockReturnValue(restorationPending);

    let requestCompleted = false;
    const requestPending = updateSession(
      createRequest('/en/dashboard/credits'),
      'en',
    ).then((response) => {
      requestCompleted = true;
      return response;
    });

    await vi.waitFor(() => {
      expect(ensureUserApplicationState).toHaveBeenCalledWith({
        createdAt: '2025-08-29T11:38:46.727Z',
        email: 'returning@example.com',
        id: 'returning-user-id',
      });
    });
    expect(requestCompleted).toBe(false);

    finishRestoration();

    await expect(requestPending).resolves.toBeDefined();
    expect(requestCompleted).toBe(true);
    expect(NextResponse.next).toHaveBeenCalled();
  });

  it('does not run restoration outside dashboard routes', async () => {
    vi.mocked(ensureUserApplicationState).mockResolvedValue('existing');

    await updateSession(createRequest('/en/profile'), 'en');

    expect(ensureUserApplicationState).not.toHaveBeenCalled();
  });

  it.each(['missing user', 'auth error', 'rejected lookup'])(
    'reports %s without blocking the dashboard',
    async (failure) => {
      const lookupError = new Error('Auth unavailable');
      if (failure === 'rejected lookup') {
        getUser.mockRejectedValue(lookupError);
      } else {
        getUser.mockResolvedValue({
          data: { user: null },
          error: failure === 'auth error' ? lookupError : null,
        });
      }

      const response = await updateSession(
        createRequest('/en/dashboard/credits'),
        'en',
      );

      expect(captureException).toHaveBeenCalledExactlyOnceWith(
        failure === 'rejected lookup'
          ? lookupError
          : expect.objectContaining({
              cause: failure === 'auth error' ? lookupError : null,
              message: 'Failed to fetch Auth user for restoration.',
            }),
        {
          tags: { area: 'auth', flow: 'inactive-user-reactivation' },
          user: { id: 'returning-user-id' },
        },
      );
      expect(ensureUserApplicationState).not.toHaveBeenCalled();
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it('continues to the dashboard when restoration fails', async () => {
    vi.mocked(ensureUserApplicationState).mockRejectedValue(
      new Error('restoration failed'),
    );

    const response = await updateSession(
      createRequest('/en/dashboard/credits'),
      'en',
    );

    expect(response.headers.get('location')).toBeNull();
    expect(NextResponse.next).toHaveBeenCalled();
    expect(nextResponseMocks.redirect).not.toHaveBeenCalled();
  });
});
