import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureUserApplicationState } from '@/lib/supabase/ensure-user-application-state';
import { updateSession } from '@/lib/supabase/middleware';
import { createClient } from '@/lib/supabase/server';

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
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
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
