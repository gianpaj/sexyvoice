import { init, instrumentSupabaseClient } from '@sentry/nextjs';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient as createSdkClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getBrowserTracePropagationTargets } from '@/lib/sentry/trace-propagation';

vi.unmock('@/lib/supabase/server');
vi.unmock('@/lib/supabase/admin');
vi.unmock('next/server');
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({})),
  createServerClient: vi.fn(() => ({})),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({
  addIntegration: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  consoleLoggingIntegration: vi.fn(() => ({ name: 'consoleLogging' })),
  init: vi.fn(),
  instrumentSupabaseClient: vi.fn(),
  vercelAIIntegration: vi.fn(() => ({ name: 'vercelAI' })),
}));
vi.mock('@supabase/supabase-js/tracing', () => {
  throw new Error(
    'Supabase SDK tracing must not load; Sentry owns propagation',
  );
});
vi.mock('@/lib/posthog-browser', () => ({ initPostHog: vi.fn() }));
vi.mock('@/lib/sentry/supabase-privacy', () => ({
  sanitizeSupabaseBreadcrumb: vi.fn((breadcrumb) => breadcrumb),
  sanitizeSupabaseEvent: vi.fn((event) => event),
  sanitizeSupabaseSpan: vi.fn((span) => span),
  sanitizeSupabaseTransaction: vi.fn((event) => event),
}));

const supabaseUrl = 'https://project.supabase.co';
const appOrigin = 'https://app.example.test';
const storedCookies = [{ name: 'session', value: 'old-token' }];
const refreshedCookies = [
  {
    name: 'session',
    options: { httpOnly: true, path: '/', sameSite: 'lax' as const },
    value: 'new-token',
  },
];
const refreshHeaders = { 'cache-control': 'private, no-store' };
const cookieStore = {
  getAll: vi.fn(() => storedCookies),
  set: vi.fn(),
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  cookieStore.set.mockReset();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_wiring');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_wiring');
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.mocked(cookies).mockResolvedValue(
    cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Supabase factory Sentry wiring', () => {
  it('instruments the browser singleton once, retaining retry ownership and SDK propagation defaults', async () => {
    const { default: useSupabaseBrowser, getSupabaseBrowserClient } =
      await import('@/lib/supabase/client');
    const client = getSupabaseBrowserClient();

    expect(getSupabaseBrowserClient()).toBe(client);
    expect(useSupabaseBrowser()).toBe(client);
    expect(createBrowserClient).toHaveBeenCalledExactlyOnceWith(
      supabaseUrl,
      'sb_publishable_wiring',
      { db: { retry: false } },
    );
    expect(client).toBe(vi.mocked(createBrowserClient).mock.results[0].value);
    expect(instrumentSupabaseClient).toHaveBeenCalledExactlyOnceWith(client, {
      sendOperationData: false,
    });
  });

  describe('SDK propagation remains unset', () => {
    it('instruments each server client without opting into SDK propagation', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      const first = await createClient();
      const second = await createClient();

      expect(first).not.toBe(second);
      expect(createServerClient).toHaveBeenCalledTimes(2);
      expect(createServerClient).toHaveBeenLastCalledWith(
        supabaseUrl,
        'sb_publishable_wiring',
        {
          cookies: {
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          },
        },
      );
      expect(instrumentSupabaseClient).toHaveBeenCalledTimes(2);
      for (const [index, client] of [first, second].entries()) {
        expect(client).toBe(
          vi.mocked(createServerClient).mock.results[index].value,
        );
        expect(instrumentSupabaseClient).toHaveBeenNthCalledWith(
          index + 1,
          client,
          {
            sendOperationData: false,
          },
        );
      }
    });

    it('instruments each admin client and retains non-persistent auth', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const first = createAdminClient();
      const second = createAdminClient();

      expect(first).not.toBe(second);
      expect(createSdkClient).toHaveBeenCalledTimes(2);
      expect(createSdkClient).toHaveBeenLastCalledWith(
        supabaseUrl,
        'sb_secret_wiring',
        {
          auth: { autoRefreshToken: false, persistSession: false },
        },
      );
      expect(instrumentSupabaseClient).toHaveBeenCalledTimes(2);
      for (const [index, client] of [first, second].entries()) {
        expect(client).toBe(
          vi.mocked(createSdkClient).mock.results[index].value,
        );
        expect(instrumentSupabaseClient).toHaveBeenNthCalledWith(
          index + 1,
          client,
          {
            sendOperationData: false,
          },
        );
      }
    });

    it('instruments each middleware client without opting into SDK propagation', async () => {
      const { createMiddlewareClient } = await import(
        '@/lib/supabase/middleware-client'
      );
      const request = new NextRequest(appOrigin);
      const response = NextResponse.next();
      const first = createMiddlewareClient(request, response);
      const second = createMiddlewareClient(request, response);

      expect(first).not.toBe(second);
      expect(createServerClient).toHaveBeenCalledTimes(2);
      expect(createServerClient).toHaveBeenLastCalledWith(
        supabaseUrl,
        'sb_publishable_wiring',
        {
          cookies: {
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          },
        },
      );
      expect(instrumentSupabaseClient).toHaveBeenCalledTimes(2);
      for (const [index, client] of [first, second].entries()) {
        expect(client).toBe(
          vi.mocked(createServerClient).mock.results[index].value,
        );
        expect(instrumentSupabaseClient).toHaveBeenNthCalledWith(
          index + 1,
          client,
          {
            sendOperationData: false,
          },
        );
      }
    });
  });

  it('preserves the server cookie adapter and refresh response headers', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const headers = new Headers();
    await createClient(headers);
    const adapter = vi.mocked(createServerClient).mock.calls[0][2].cookies;

    expect(await adapter.getAll()).toBe(storedCookies);
    await adapter.setAll?.(refreshedCookies, refreshHeaders);
    expect(cookieStore.set).toHaveBeenCalledExactlyOnceWith(
      'session',
      'new-token',
      refreshedCookies[0].options,
    );
    expect(headers.get('cache-control')).toBe(refreshHeaders['cache-control']);
  });

  it('tolerates read-only server cookies and omitted response headers', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    cookieStore.set.mockImplementation(() => {
      throw new Error('Read-only cookies');
    });
    await createClient();
    const adapter = vi.mocked(createServerClient).mock.calls[0][2].cookies;

    expect(() =>
      adapter.setAll?.(refreshedCookies, refreshHeaders),
    ).not.toThrow();
    expect(cookieStore.set).toHaveBeenCalledOnce();
  });

  it('preserves middleware cookies, auth headers, locale rewrite and request overrides', async () => {
    const { createMiddlewareClient } = await import(
      '@/lib/supabase/middleware-client'
    );
    const request = new NextRequest(`${appOrigin}/dashboard`, {
      headers: { cookie: 'session=old-token', 'x-locale': 'en' },
    });
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set('x-locale', 'de');
    const response = NextResponse.rewrite(`${appOrigin}/de/dashboard`, {
      request: { headers: forwardedHeaders },
    });
    createMiddlewareClient(request, response);
    const adapter = vi.mocked(createServerClient).mock.calls[0][2].cookies;

    expect(await adapter.getAll()).toEqual(storedCookies);
    await adapter.setAll?.(refreshedCookies, refreshHeaders);
    expect(request.cookies.get('session')?.value).toBe('new-token');
    expect(response.cookies.get('session')).toMatchObject({
      ...refreshedCookies[0].options,
      name: 'session',
      value: 'new-token',
    });
    expect(response.headers.get('cache-control')).toBe(
      refreshHeaders['cache-control'],
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      `${appOrigin}/de/dashboard`,
    );
    expect(response.headers.get('x-middleware-request-cookie')).toBe(
      'session=new-token',
    );
    expect(response.headers.get('x-middleware-request-x-locale')).toBe('de');
    expect(
      response.headers.get('x-middleware-override-headers')?.split(','),
    ).toEqual(expect.arrayContaining(['cookie', 'x-locale']));
  });
});

describe('Sentry config initialization', () => {
  it.each(['production', 'development'] as const)(
    'preserves Node and Edge privacy, logging and sampling in %s',
    async (environment) => {
      vi.stubEnv('NODE_ENV', environment);
      const privacy = await import('@/lib/sentry/supabase-privacy');
      await import('@/sentry.server.config');
      await import('@/sentry.edge.config');

      expect(init).toHaveBeenCalledTimes(2);
      const [nodeOptions, edgeOptions] = vi
        .mocked(init)
        .mock.calls.map(([options]) => options);
      for (const options of [nodeOptions, edgeOptions]) {
        expect(options).toMatchObject({
          beforeBreadcrumb: privacy.sanitizeSupabaseBreadcrumb,
          beforeSend: privacy.sanitizeSupabaseEvent,
          beforeSendSpan: privacy.sanitizeSupabaseSpan,
          beforeSendTransaction: privacy.sanitizeSupabaseTransaction,
          debug: false,
          enabled: environment === 'production',
          enableLogs: true,
          tracesSampleRate: 0.1,
        });
      }
      expect(nodeOptions).toHaveProperty('propagateTraceparent', true);
      expect(edgeOptions).not.toHaveProperty('propagateTraceparent');
    },
  );

  it('uses browser Sentry propagation with privacy hooks and existing trace/replay sampling', async () => {
    vi.stubGlobal('window', {
      location: new URL(`${appOrigin}/dashboard`),
      requestIdleCallback: vi.fn(),
    });
    const privacy = await import('@/lib/sentry/supabase-privacy');
    await import('@/instrumentation-client');

    expect(init).toHaveBeenCalledOnce();
    const options = vi.mocked(init).mock.calls[0][0];
    expect(options).toMatchObject({
      beforeBreadcrumb: privacy.sanitizeSupabaseBreadcrumb,
      beforeSend: expect.any(Function),
      beforeSendSpan: privacy.sanitizeSupabaseSpan,
      beforeSendTransaction: privacy.sanitizeSupabaseTransaction,
      debug: false,
      enableLogs: true,
      integrations: [],
      propagateTraceparent: true,
      replaysOnErrorSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      tracePropagationTargets: getBrowserTracePropagationTargets(),
      tracesSampleRate: 0.1,
    });
    const event = {
      message: 'Application error',
      request: { url: `${appOrigin}/dashboard` },
      type: undefined,
    };
    const hint = {};
    expect(await options?.beforeSend?.(event, hint)).toBe(event);
    expect(privacy.sanitizeSupabaseEvent).toHaveBeenCalledExactlyOnceWith(
      event,
      hint,
    );
    expect(
      await options?.beforeSend?.(
        { request: { url: 'app://extension' }, type: undefined },
        hint,
      ),
    ).toBeNull();
    expect(privacy.sanitizeSupabaseEvent).toHaveBeenCalledOnce();
  });
});

describe('browser trace propagation targets', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: new URL(`${appOrigin}/dashboard`) });
  });

  function allows(url: string) {
    return getBrowserTracePropagationTargets().some((target) =>
      target.test(url),
    );
  }

  it.each([
    '/',
    '/api/voices',
    '/api/voices?limit=1',
    appOrigin,
    `${appOrigin}/api/voices`,
    supabaseUrl,
    `${supabaseUrl}/rest/v1/voices?select=id`,
  ])('allows %s', (url) => {
    expect(allows(url)).toBe(true);
  });

  it.each([
    '//evil.test/api',
    '//project.supabase.co/rest/v1/voices',
    'https://evil.test/',
    'https://projectXsupabase.co/rest/v1/voices',
    'https://project.supabase.co.evil.test/',
    'https://project.supabase.co@evil.test/',
    'https://user:password@project.supabase.co/',
    'https://project.supabase.co:444/',
    'http://project.supabase.co/',
    'https://app.example.test.evil.test/',
    'https://app.example.test@evil.test/',
    'https://user@app.example.test/',
    'https://app.example.test:444/',
    'http://app.example.test/',
  ])('rejects %s', (url) => {
    expect(allows(url)).toBe(false);
  });

  it.each([
    undefined,
    '',
    'not a URL',
    'https://',
    '//evil.test',
    'javascript:alert(1)',
    'ftp://evil.test',
  ])('fails closed for Supabase URL %s', (url) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url);
    expect(() => getBrowserTracePropagationTargets()).not.toThrow();
    expect(allows('/api/voices')).toBe(true);
    expect(allows(`${appOrigin}/api/voices`)).toBe(true);
    expect(allows(`${supabaseUrl}/rest/v1/voices`)).toBe(false);
    expect(allows('https://evil.test/')).toBe(false);
    expect(allows('//evil.test/')).toBe(false);
  });

  it('uses only the configured origin, not its path', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'http://localhost:54321/configured/path',
    );
    expect(allows('http://localhost:54321/rest/v1/voices')).toBe(true);
    expect(allows('http://localhost:54322/rest/v1/voices')).toBe(false);
    expect(allows('https://localhost:54321/rest/v1/voices')).toBe(false);
    expect(allows('http://localhost/rest/v1/voices')).toBe(false);
  });

  it('is safe without window or a configured Supabase URL', () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    expect(getBrowserTracePropagationTargets()).toHaveLength(1);
    expect(allows('/api/voices')).toBe(true);
    expect(allows(`${appOrigin}/api/voices`)).toBe(false);
    expect(allows('//evil.test/')).toBe(false);
  });
});
