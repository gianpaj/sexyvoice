import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updateSession } from '@/lib/supabase/proxy';
import { createClient } from '@/lib/supabase/server';

vi.unmock('next/server');
vi.unmock('@/lib/supabase/server');
vi.mock('@/lib/e2e-mode', () => ({ isE2E: () => true }));

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { getAll: vi.fn(), set: vi.fn() },
}));
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));

const user = {
  email: 'test@example.com',
  id: '927a0ad0-ec4f-4120-a386-be7b67a72863',
};
const cookieName = 'sb-session-test-auth-token';
const fetchMock = vi.fn<typeof fetch>();

function token(expiresAt: number) {
  return `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ exp: expiresAt, sub: user.id })).toString('base64url')}.${Buffer.from('signature').toString('base64url')}`;
}

function session(expiresAt: number) {
  return {
    access_token: token(expiresAt),
    expires_at: expiresAt,
    expires_in: 3600,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    user,
  };
}

function expiredCookie() {
  return `base64-${Buffer.from(JSON.stringify(session(1))).toString('base64url')}`;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://session-test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  fetchMock.mockReset().mockImplementation(async (url) => {
    if (String(url).includes('/token?')) {
      return Response.json(session(Math.floor(Date.now() / 1000) + 3600));
    }
    if (String(url).endsWith('/user')) return Response.json(user);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  cookieStore.getAll.mockReturnValue([
    { name: cookieName, value: expiredCookie() },
  ]);
  cookieStore.set.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SSR session response integration', () => {
  it('forwards refreshed cookies through a locale rewrite and preserves locale overrides', async () => {
    const request = new NextRequest('https://sexyvoice.ai/en/dashboard', {
      headers: {
        cookie: `${cookieName}=${expiredCookie()}`,
        'x-next-intl-locale': 'wrong',
      },
    });
    const renderHeaders = new Headers(request.headers);
    renderHeaders.set('x-next-intl-locale', 'en');
    const rewrite = NextResponse.rewrite(
      new URL('/en/dashboard', request.url),
      {
        request: { headers: renderHeaders },
      },
    );
    const response = await updateSession(request, 'en', rewrite);

    expect(response).toBe(rewrite);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://sexyvoice.ai/en/dashboard',
    );
    expect(
      response.headers.get('x-middleware-request-x-next-intl-locale'),
    ).toBe('en');
    expect(response.headers.get('x-middleware-request-cookie')).toBe(
      request.headers.get('cookie'),
    );
    expect(request.cookies.get(cookieName)?.value).not.toBe(expiredCookie());
    expect(response.cookies.get(cookieName)?.value).toBe(
      request.cookies.get(cookieName)?.value,
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
  });

  it('preserves session cookies and cache headers on an auth redirect', async () => {
    const request = new NextRequest('https://sexyvoice.ai/en/login', {
      headers: { cookie: `${cookieName}=${expiredCookie()}` },
    });
    const response = await updateSession(request, 'en');
    expect(response.headers.get('location')).toBe(
      'https://sexyvoice.ai/en/dashboard',
    );
    expect(response.cookies.get(cookieName)).toBeDefined();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });

  it('collects cache headers alongside route-handler cookie writes', async () => {
    const headers = new Headers();
    const client = await createClient(headers);
    const result = await client.auth.getUser();
    expect(result.data.user?.id).toBe(user.id);
    expect(cookieStore.set).toHaveBeenCalled();
    expect(headers.get('cache-control')).toContain('no-store');
    expect(headers.get('pragma')).toBe('no-cache');
  });
});
