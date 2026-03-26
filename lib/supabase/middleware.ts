import { captureMessage } from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';

import { i18n } from '@/lib/i18n/i18n-config';
import { OAUTH_CALLBACK_COOKIE_NAME } from './constants';
import { verifyOauthCallbackMarkerValue } from './oauth-callback-marker';
import { createClient } from './server';

const routesPerLocale = (routes: string[]): string[] =>
  i18n.locales.flatMap((locale) =>
    routes.flatMap((route) =>
      route === '/' ? [`/${locale}`, `/${locale}/`] : `/${locale}${route}`,
    ),
  );

const clearOauthCallbackCookie = (response: NextResponse) => {
  response.cookies.set({
    name: OAUTH_CALLBACK_COOKIE_NAME,
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
  ...routesPerLocale(['/', '/signup', '/login', '/reset-password']),
];

const isDashboardPath = (pathname: string, locale: string) =>
  pathname === `/${locale}/dashboard` ||
  pathname.startsWith(`/${locale}/dashboard/`);

export const updateSession = async (
  request: NextRequest,
  locale: string,
  response: NextResponse = NextResponse.next({ request }),
) => {
  try {
    const { pathname } = request.nextUrl;
    const supabaseResponse = response;
    const rawOauthCallbackMarker = request.cookies.get(
      OAUTH_CALLBACK_COOKIE_NAME,
    )?.value;
    const hasOauthCallbackMarker = verifyOauthCallbackMarkerValue(
      rawOauthCallbackMarker,
    );

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    console.log('OAuth callback marker middleware check', {
      pathname,
      locale,
      isDashboardPath: isDashboardPath(pathname, locale),
      hasRawOauthCallbackMarker: Boolean(rawOauthCallbackMarker),
      rawOauthCallbackMarkerLength: rawOauthCallbackMarker?.length ?? 0,
      hasOauthCallbackMarker,
      hasUser: Boolean(user),
    });

    if (!user && isDashboardPath(pathname, locale)) {
      const redirectResponse = NextResponse.redirect(
        new URL(`/${locale}/login`, request.url),
      );

      if (hasOauthCallbackMarker) {
        console.warn(
          'OAuth callback marker present but dashboard session missing',
          {
            pathname,
            locale,
            hasRawOauthCallbackMarker: Boolean(rawOauthCallbackMarker),
            rawOauthCallbackMarkerLength: rawOauthCallbackMarker?.length ?? 0,
            hasOauthCallbackMarker,
          },
        );

        captureMessage(
          'OAuth callback completed but dashboard session was missing.',
          {
            level: 'error',
            tags: {
              area: 'auth',
              flow: 'oauth-callback',
            },
            extra: {
              pathname,
              locale,
            },
          },
        );

        return clearOauthCallbackCookie(redirectResponse);
      }

      console.log(
        'Dashboard request missing user without valid OAuth callback marker',
        {
          pathname,
          locale,
          hasRawOauthCallbackMarker: Boolean(rawOauthCallbackMarker),
          rawOauthCallbackMarkerLength: rawOauthCallbackMarker?.length ?? 0,
          hasOauthCallbackMarker,
        },
      );

      // no user, potentially respond by redirecting the user to the login page
      return redirectResponse;
    }

    const isPublicRoute = publicRoutes.includes(pathname);

    if (!(user || isPublicRoute)) {
      // If there's no session and trying to access a protected route (not the dashboard), redirect to the home page
      return NextResponse.redirect(new URL(`/${locale}`, request.url));
    }

    const authRoutes = routesPerLocale(['/signup', '/login']);

    if (user && authRoutes.includes(pathname)) {
      return NextResponse.redirect(
        new URL(`/${locale}/dashboard`, request.url),
      );
    }

    if (hasOauthCallbackMarker && isDashboardPath(pathname, locale)) {
      console.log(
        'Clearing OAuth callback marker after successful dashboard session check',
        {
          pathname,
          locale,
          hasRawOauthCallbackMarker: Boolean(rawOauthCallbackMarker),
          rawOauthCallbackMarkerLength: rawOauthCallbackMarker?.length ?? 0,
          hasOauthCallbackMarker,
          hasUser: Boolean(user),
        },
      );

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
    console.error('Middleware error:', e);
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }
};
