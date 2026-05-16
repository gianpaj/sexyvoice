import { captureMessage } from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from '@/src/i18n/routing';
import { verifyAuthCallbackMarkerValue } from './auth-callback-marker';
import { AUTH_CALLBACK_COOKIE_NAME } from './constants';
import { createClient } from './server';

const routesPerLocale = (routes: string[]): string[] =>
  routing.locales.flatMap((locale) =>
    routes.flatMap((route) =>
      route === '/' ? [`/${locale}`, `/${locale}/`] : `/${locale}${route}`,
    ),
  );

const clearAuthCallbackCookie = (response: NextResponse) => {
  response.cookies.set({
    name: AUTH_CALLBACK_COOKIE_NAME,
    value: '',
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
};

const publicRoutes = [
  '/api/health',
  '/auth/callback',
  '/auth/confirm',
  ...routesPerLocale([
    '/',
    '/signup',
    '/login',
    '/reset-password',
    '/cli/login',
  ]),
];

const isDashboardPath = (pathname: string, locale: string) =>
  pathname === `/${locale}/dashboard` ||
  pathname.startsWith(`/${locale}/dashboard/`);

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
  try {
    const { pathname } = request.nextUrl;
    const supabaseResponse = response;
    const rawAuthCallbackMarker = request.cookies.get(
      AUTH_CALLBACK_COOKIE_NAME,
    )?.value;
    const hasAuthCallbackMarker = verifyAuthCallbackMarkerValue(
      rawAuthCallbackMarker,
    );

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dashboardPath = isDashboardPath(pathname, locale);

    if (!user && dashboardPath) {
      const redirectResponse = redirectWithSupabaseCookies(
        new URL(`/${locale}/login`, request.url),
        supabaseResponse,
      );

      if (hasAuthCallbackMarker) {
        captureMessage(
          'Auth callback completed but dashboard session was missing.',
          {
            level: 'error',
            tags: {
              area: 'auth',
              flow: 'auth-callback',
            },
            extra: {
              pathname,
              locale,
            },
          },
        );

        return clearAuthCallbackCookie(redirectResponse);
      }

      console.log(
        'Dashboard request missing user without valid auth callback marker',
        {
          pathname,
          locale,
          hasRawAuthCallbackMarker: Boolean(rawAuthCallbackMarker),
          rawAuthCallbackMarkerLength: rawAuthCallbackMarker?.length ?? 0,
          hasAuthCallbackMarker,
        },
      );

      // no user, potentially respond by redirecting the user to the login page
      return redirectResponse;
    }

    const isPublicRoute = publicRoutes.includes(pathname);

    if (!(user || isPublicRoute)) {
      // If there's no session and trying to access a protected route (not the dashboard), redirect to the home page
      return redirectWithSupabaseCookies(
        new URL(`/${locale}`, request.url),
        supabaseResponse,
      );
    }

    const authRoutes = routesPerLocale(['/signup', '/login']);

    if (user && authRoutes.includes(pathname)) {
      return redirectWithSupabaseCookies(
        new URL(`/${locale}/dashboard`, request.url),
        supabaseResponse,
      );
    }

    if (hasAuthCallbackMarker && dashboardPath) {
      return clearAuthCallbackCookie(supabaseResponse);
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
    console.error('Middleware error:', e);
    return redirectWithSupabaseCookies(
      new URL(`/${locale}`, request.url),
      response,
    );
  }
};
