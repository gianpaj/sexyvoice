import { captureException, captureMessage } from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';

import { isE2E } from '@/lib/e2e-mode';
import { routing } from '@/src/i18n/routing';
import { getVerifiedClaims } from './auth';
import { OAUTH_CALLBACK_COOKIE_NAME } from './constants';
import { ensureUserApplicationState } from './ensure-user-application-state';
import { copyAuthResponse, createMiddlewareClient } from './middleware-client';
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

const redirectWithSupabaseCookies = (
  url: URL,
  supabaseResponse: NextResponse,
) => copyAuthResponse(supabaseResponse, NextResponse.redirect(url));

export const updateSession = async (
  request: NextRequest,
  locale: string,
  response: NextResponse = NextResponse.next({ request }),
) => {
  const supabaseResponse = response;

  try {
    const { pathname } = request.nextUrl;
    const rawOauthCallbackMarker = request.cookies.get(
      OAUTH_CALLBACK_COOKIE_NAME,
    )?.value;
    const hasOauthCallbackMarker = verifyOauthCallbackMarkerValue(
      rawOauthCallbackMarker,
    );

    const supabase = createMiddlewareClient(request, supabaseResponse);

    // Keep this call immediately after creating the request-scoped client.
    // It refreshes near-expiry tokens and verifies JWT signatures.
    const claims = await getVerifiedClaims(supabase);
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

    if (claims?.sub && dashboardPath && !isE2E()) {
      try {
        await ensureUserApplicationState({
          email: claims.email,
          // JWT claims omit the creation date; fetch it only for a missing profile.
          getCreatedAt: async () => {
            try {
              // biome-ignore lint/plugin/use-verified-claims: Profile restoration needs Auth created_at, which JWT claims omit.
              const { data, error } = await supabase.auth.getUser();
              if (error || !data.user) {
                throw new Error('Failed to fetch Auth user for restoration.', {
                  cause: error,
                });
              }
              return data.user.created_at;
            } catch (error) {
              captureException(error, {
                tags: { area: 'auth', flow: 'inactive-user-reactivation' },
                user: { id: claims?.sub },
              });
              throw error;
            }
          },
          id: claims.sub,
        });
      } catch {
        // Auth lookup failures are reported above; repair failures in the helper.
        // Never block dashboard access on this best-effort repair.
      }
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

    // Preserve the locale rewrite, refreshed request cookies, and auth cache headers.
    return supabaseResponse;
  } catch (e) {
    console.error('Proxy error:', e);
    return redirectWithSupabaseCookies(
      new URL(`/${locale}`, request.url),
      supabaseResponse,
    );
  }
};
