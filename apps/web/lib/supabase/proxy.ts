import { captureMessage } from '@sentry/nextjs';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from '@/src/i18n/routing';
import { OAUTH_CALLBACK_COOKIE_NAME } from './constants';
import { verifyOauthCallbackMarkerValue } from './oauth-callback-marker';

const routesPerLocale = (routes: string[]): string[] =>
  routing.locales.flatMap((locale) =>
    routes.flatMap((route) =>
      route === '/' ? [`/${locale}`, `/${locale}/`] : `/${locale}${route}`,
    ),
  );

const clearOauthCallbackCookie = (response: NextResponse) => {
  response.cookies.set({
    httpOnly: true,
    maxAge: 0,
    name: OAUTH_CALLBACK_COOKIE_NAME,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    value: '',
  });

  return response;
};

const publicRoutes = [
  '/api/health',
  '/auth/signup',
  '/auth/callback',
  ...routesPerLocale([
    '/',
    '/signup',
    '/login',
    '/reset-password',
    '/cli/login',
    '/voice-call',
    '/voice-cloning',
  ]),
];

const isDashboardPath = (pathname: string, locale: string) =>
  pathname === `/${locale}/dashboard` ||
  pathname.startsWith(`/${locale}/dashboard/`);

const copyResponseState = (source: NextResponse, target: NextResponse) => {
  const sourceOverrideHeaders = source.headers
    .get('x-middleware-override-headers')
    ?.split(',')
    .map((header) => header.trim())
    .filter(Boolean);
  const targetOverrideHeaders = target.headers
    .get('x-middleware-override-headers')
    ?.split(',')
    .map((header) => header.trim())
    .filter(Boolean);

  for (const [key, value] of source.headers.entries()) {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey === 'set-cookie' ||
      normalizedKey === 'x-middleware-override-headers' ||
      normalizedKey === 'x-middleware-request-cookie'
    ) {
      continue;
    }

    target.headers.set(key, value);
  }

  const overrideHeaders = new Set([
    ...(sourceOverrideHeaders ?? []),
    ...(targetOverrideHeaders ?? []),
  ]);

  if (overrideHeaders.size > 0) {
    target.headers.set(
      'x-middleware-override-headers',
      [...overrideHeaders].join(','),
    );
  }

  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }

  return target;
};

const redirectWithSupabaseCookies = (
  url: URL,
  supabaseResponse: NextResponse,
) => {
  const redirectResponse = NextResponse.redirect(url);

  for (const cookie of supabaseResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }

  return redirectResponse;
};

export const updateSession = async (
  request: NextRequest,
  locale: string,
  response: NextResponse = NextResponse.next({ request }),
) => {
  let supabaseResponse = response;

  try {
    const { pathname } = request.nextUrl;
    const rawOauthCallbackMarker = request.cookies.get(
      OAUTH_CALLBACK_COOKIE_NAME,
    )?.value;
    const hasOauthCallbackMarker = verifyOauthCallbackMarkerValue(
      rawOauthCallbackMarker,
    );

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }

            const refreshedResponse = copyResponseState(
              supabaseResponse,
              NextResponse.next({ request }),
            );

            for (const { name, value, options } of cookiesToSet) {
              refreshedResponse.cookies.set(name, value, options);
            }

            supabaseResponse = refreshedResponse;
          },
        },
      },
    );

    // Keep this call immediately after creating the request-scoped client.
    // It refreshes near-expiry tokens and verifies JWT signatures.
    const { data, error } = await supabase.auth.getClaims();
    const claims = error ? null : data?.claims;
    const isAuthenticated = Boolean(claims?.sub);

    const dashboardPath = isDashboardPath(pathname, locale);

    if (!isAuthenticated && dashboardPath) {
      const redirectResponse = redirectWithSupabaseCookies(
        new URL(`/${locale}/login`, request.url),
        supabaseResponse,
      );

      if (hasOauthCallbackMarker) {
        captureMessage(
          'OAuth callback completed but dashboard session was missing.',
          {
            extra: {
              locale,
              pathname,
            },
            level: 'error',
            tags: {
              area: 'auth',
              flow: 'oauth-callback',
            },
          },
        );

        return clearOauthCallbackCookie(redirectResponse);
      }

      console.log(
        'Dashboard request missing user without valid OAuth callback marker',
        {
          hasOauthCallbackMarker,
          hasRawOauthCallbackMarker: Boolean(rawOauthCallbackMarker),
          locale,
          pathname,
          rawOauthCallbackMarkerLength: rawOauthCallbackMarker?.length ?? 0,
        },
      );

      // no user, potentially respond by redirecting the user to the login page
      return redirectResponse;
    }

    const isPublicRoute = publicRoutes.includes(pathname);

    if (!(isAuthenticated || isPublicRoute)) {
      // If there's no session and trying to access a protected route (not the dashboard), redirect to the home page
      return redirectWithSupabaseCookies(
        new URL(`/${locale}`, request.url),
        supabaseResponse,
      );
    }

    const authRoutes = routesPerLocale(['/signup', '/login']);

    if (isAuthenticated && authRoutes.includes(pathname)) {
      return redirectWithSupabaseCookies(
        new URL(`/${locale}/dashboard`, request.url),
        supabaseResponse,
      );
    }

    if (hasOauthCallbackMarker && dashboardPath) {
      return clearOauthCallbackCookie(supabaseResponse);
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
    // creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely!

    return supabaseResponse;
  } catch (e) {
    console.error('Proxy error:', e);
    return redirectWithSupabaseCookies(
      new URL(`/${locale}`, request.url),
      supabaseResponse,
    );
  }
};
