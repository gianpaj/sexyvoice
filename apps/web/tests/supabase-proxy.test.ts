import { captureMessage } from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OAUTH_CALLBACK_COOKIE_NAME } from '@/lib/supabase/constants';
import { createOauthCallbackMarkerValue } from '@/lib/supabase/oauth-callback-marker';
import { updateSession } from '@/lib/supabase/proxy';

vi.unmock('next/server');

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

interface ProxyCookieAdapter {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: {
      name: string;
      options?: {
        httpOnly?: boolean;
        path?: string;
        sameSite?: 'lax';
      };
      value: string;
    }[],
  ) => void;
}

const authenticatedClaims = {
  data: {
    claims: {
      sub: 'test-user-id',
    },
  },
  error: null,
};

const unauthenticatedClaims = {
  data: null,
  error: null,
};

const createRequest = (pathname: string) =>
  new NextRequest(new URL(pathname, 'https://example.com'));

const redirectLocation = (response: NextResponse) =>
  response.headers.get('location');

describe('Supabase Proxy', () => {
  let cookieAdapter: ProxyCookieAdapter | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    cookieAdapter = undefined;
    mocks.createServerClient.mockImplementation((...args: unknown[]) => {
      const options = args[2] as { cookies: ProxyCookieAdapter };
      cookieAdapter = options.cookies;

      return {
        auth: {
          getClaims: mocks.getClaims,
        },
      };
    });
    mocks.getClaims.mockResolvedValue(authenticatedClaims);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies protected requests with getClaims and the publishable key', async () => {
    const request = createRequest('/en/dashboard/generate');

    const response = await updateSession(request, 'en');

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(redirectLocation(response)).toBeNull();
  });

  it('redirects unauthenticated dashboard requests to localized login', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.getClaims.mockResolvedValue(unauthenticatedClaims);

    const response = await updateSession(
      createRequest('/en/dashboard/generate'),
      'en',
    );

    expect(redirectLocation(response)).toBe('https://example.com/en/login');
  });

  it('treats getClaims errors as unauthenticated', async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: new Error('Invalid JWT'),
    });

    const response = await updateSession(createRequest('/en/account'), 'en');

    expect(redirectLocation(response)).toBe('https://example.com/en');
  });

  it('allows unauthenticated requests to public routes', async () => {
    mocks.getClaims.mockResolvedValue(unauthenticatedClaims);

    const response = await updateSession(createRequest('/en/voice-call'), 'en');

    expect(redirectLocation(response)).toBeNull();
  });

  it('redirects authenticated users away from login', async () => {
    const response = await updateSession(createRequest('/en/login'), 'en');

    expect(redirectLocation(response)).toBe('https://example.com/en/dashboard');
  });

  it('propagates refreshed cookies and preserves next-intl response state', async () => {
    const request = createRequest('/en/dashboard/generate');
    const initialResponse = NextResponse.next({ request });
    initialResponse.headers.set(
      'x-middleware-rewrite',
      'https://example.com/en/dashboard/generate',
    );
    initialResponse.headers.set(
      'x-middleware-request-x-next-intl-locale',
      'en',
    );
    initialResponse.headers.set(
      'x-middleware-override-headers',
      'x-next-intl-locale',
    );
    initialResponse.cookies.set('existing-cookie', 'existing-value');

    mocks.getClaims.mockImplementation(() => {
      cookieAdapter?.setAll([
        {
          name: 'sb-access-token',
          options: {
            httpOnly: true,
            path: '/',
            sameSite: 'lax',
          },
          value: 'refreshed-token',
        },
      ]);

      return authenticatedClaims;
    });

    const response = await updateSession(request, 'en', initialResponse);

    expect(request.cookies.get('sb-access-token')?.value).toBe(
      'refreshed-token',
    );
    expect(response.cookies.get('sb-access-token')?.value).toBe(
      'refreshed-token',
    );
    expect(response.cookies.get('existing-cookie')?.value).toBe(
      'existing-value',
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/en/dashboard/generate',
    );
    expect(
      response.headers.get('x-middleware-request-x-next-intl-locale'),
    ).toBe('en');

    const overrideHeaders =
      response.headers.get('x-middleware-override-headers')?.split(',') ?? [];
    expect(overrideHeaders).toContain('cookie');
    expect(overrideHeaders).toContain('x-next-intl-locale');
    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      'sb-access-token=refreshed-token',
    );
  });

  it('copies refreshed Supabase cookies onto redirects', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.getClaims.mockImplementation(() => {
      cookieAdapter?.setAll([
        {
          name: 'sb-access-token',
          options: { httpOnly: true, path: '/', sameSite: 'lax' },
          value: 'refreshed-token',
        },
      ]);

      return unauthenticatedClaims;
    });

    const response = await updateSession(
      createRequest('/en/dashboard/generate'),
      'en',
    );

    expect(redirectLocation(response)).toBe('https://example.com/en/login');
    expect(response.cookies.get('sb-access-token')?.value).toBe(
      'refreshed-token',
    );
  });

  it('reports and clears a valid OAuth marker when dashboard claims are missing', async () => {
    process.env.API_KEY_HMAC_SECRET = 'test-oauth-marker-secret';
    mocks.getClaims.mockResolvedValue(unauthenticatedClaims);
    const marker = createOauthCallbackMarkerValue();
    const request = createRequest('/en/dashboard');
    request.cookies.set(OAUTH_CALLBACK_COOKIE_NAME, marker ?? '');

    const response = await updateSession(request, 'en');

    expect(captureMessage).toHaveBeenCalledWith(
      'OAuth callback completed but dashboard session was missing.',
      expect.objectContaining({
        level: 'error',
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
        },
      }),
    );
    expect(redirectLocation(response)).toBe('https://example.com/en/login');
    expect(response.cookies.get(OAUTH_CALLBACK_COOKIE_NAME)).toEqual(
      expect.objectContaining({ maxAge: 0, value: '' }),
    );
  });

  it('clears the OAuth marker after authenticated dashboard navigation', async () => {
    process.env.API_KEY_HMAC_SECRET = 'test-oauth-marker-secret';
    const marker = createOauthCallbackMarkerValue();
    const request = createRequest('/en/dashboard');
    request.cookies.set(OAUTH_CALLBACK_COOKIE_NAME, marker ?? '');

    const response = await updateSession(request, 'en');

    expect(captureMessage).not.toHaveBeenCalled();
    expect(redirectLocation(response)).toBeNull();
    expect(response.cookies.get(OAUTH_CALLBACK_COOKIE_NAME)).toEqual(
      expect.objectContaining({ maxAge: 0, value: '' }),
    );
  });
});
