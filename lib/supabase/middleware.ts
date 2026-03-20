import { captureMessage } from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';

import { i18n } from '@/lib/i18n/i18n-config';
import { createClient } from './server';

const OAUTH_CALLBACK_COOKIE_NAME = 'sv_oauth_callback_ok';

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

export const updateSession = async (
  request: NextRequest,
  locale: string,
  response: NextResponse = NextResponse.next({ request }),
) => {
  try {
    const { pathname } = request.nextUrl;
    const supabaseResponse = response;
    const hasOauthCallbackMarker =
      request.cookies.get(OAUTH_CALLBACK_COOKIE_NAME)?.value === '1';

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && pathname.includes('/dashboard')) {
      const redirectResponse = NextResponse.redirect(
        new URL(`/${locale}/login`, request.url),
      );

      if (hasOauthCallbackMarker) {
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

    if (hasOauthCallbackMarker && pathname.includes('/dashboard')) {
      clearOauthCallbackCookie(supabaseResponse);
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
