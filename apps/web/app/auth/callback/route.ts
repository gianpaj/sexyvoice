import { createHash } from 'node:crypto';
import { captureException, captureMessage } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import PostHogClient from '@/lib/posthog';
import { createOrRetrieveCustomer } from '@/lib/stripe/stripe-admin';
import { OAUTH_CALLBACK_COOKIE_NAME } from '@/lib/supabase/constants';
import {
  createOauthCallbackMarkerValue,
  OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/supabase/oauth-callback-marker';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/src/i18n/routing';

const isSafeRedirectPath = (value: string | null) =>
  Boolean(value?.startsWith('/') && !value.startsWith('//'));

const getLocaleFromRedirectPath = (redirectPath: string | null) => {
  const locale = redirectPath?.split('/')[1];

  return routing.locales.includes(locale as (typeof routing.locales)[number])
    ? locale
    : routing.defaultLocale;
};

const getOauthCodeFingerprint = (code: string | null) => {
  if (!code) {
    return {
      hasCode: false,
      codeLength: 0,
      codeFingerprint: null,
    };
  }

  return {
    hasCode: true,
    codeLength: code.length,
    codeFingerprint: createHash('sha256')
      .update(code)
      .digest('hex')
      .slice(0, 12),
  };
};

const getErrorStringProperty = (
  error: unknown,
  property: 'message' | 'name',
) => {
  if (error instanceof Error) {
    return error[property];
  }

  if (typeof error !== 'object' || error === null || !(property in error)) {
    return '';
  }

  return String((error as Record<string, unknown>)[property] ?? '');
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const isPkceCodeVerifierMissingError = (error: unknown) => {
  const errorName = getErrorStringProperty(error, 'name');
  const errorMessage = getErrorStringProperty(error, 'message');
  return (
    errorName === 'AuthPKCECodeVerifierMissingError' ||
    // Defensive fallback for serialized Supabase errors that preserve only message text.
    errorMessage.includes('PKCE code verifier not found')
  );
};

const getOauthCallbackCookieContext = (request: Request) => {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieNames = cookieHeader
    .split(';')
    .map((cookie) => cookie.split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name));
  const supabaseCookieNames = cookieNames.filter((name) => {
    const lowerName = name.toLowerCase();
    return lowerName.startsWith('sb-') || lowerName.includes('supabase');
  });

  return {
    hasCookieHeader: Boolean(cookieHeader),
    cookieCount: cookieNames.length,
    supabaseCookieCount: supabaseCookieNames.length,
    hasSupabaseAuthCookie: supabaseCookieNames.some((name) =>
      name.includes('auth-token'),
    ),
    hasSupabaseCodeVerifierCookie: supabaseCookieNames.some((name) =>
      name.includes('code-verifier'),
    ),
    hasOauthCallbackMarkerCookie: cookieNames.includes(
      OAUTH_CALLBACK_COOKIE_NAME,
    ),
  };
};

const createOauthRedirectResponse = (url: string) => {
  const response = NextResponse.redirect(url);
  const markerValue = createOauthCallbackMarkerValue();

  if (markerValue) {
    response.cookies.set({
      name: OAUTH_CALLBACK_COOKIE_NAME,
      value: markerValue,
      httpOnly: true,
      maxAge: OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
};

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;
  const redirectTo = requestUrl.searchParams.get('redirect_to');
  const locale = getLocaleFromRedirectPath(redirectTo);
  const loginPath = `/${locale}/login`;
  const oauthCodeContext = getOauthCodeFingerprint(code);
  const oauthCookieContext = getOauthCallbackCookieContext(request);
  const reportPkceCodeVerifierMissing = (error: unknown) => {
    captureMessage('OAuth callback missing PKCE code verifier.', {
      level: 'warning',
      tags: {
        area: 'auth',
        flow: 'oauth-callback',
        error_type: 'pkce-code-verifier-missing',
      },
      extra: {
        redirectTo,
        locale,
        ...oauthCodeContext,
        ...oauthCookieContext,
        errorMessage: getErrorMessage(error),
      },
    });

    return NextResponse.redirect(`${origin}${loginPath}`);
  };

  try {
    if (!code) {
      return NextResponse.redirect(`${origin}${loginPath}`);
    }
    const supabase = await createClient();
    const {
      data: { user },
      error: exchangeError,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      if (isPkceCodeVerifierMissingError(exchangeError)) {
        return reportPkceCodeVerifierMissing(exchangeError);
      }

      captureException(exchangeError, {
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
        },
        extra: {
          redirectTo,
          locale,
          ...oauthCodeContext,
          ...oauthCookieContext,
        },
      });

      return NextResponse.redirect(`${origin}${loginPath}`);
    }

    const email = user?.email;
    if (!email) {
      captureMessage('OAuth callback completed without a user email.', {
        level: 'error',
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
        },
        extra: {
          redirectTo,
          locale,
          userId: user?.id ?? null,
        },
      });

      return NextResponse.redirect(`${origin}${loginPath}`);
    }

    // Add Stripe customer creation
    if (user) {
      const stripe_id = await createOrRetrieveCustomer(user.id, user.email!);
      if (!stripe_id) {
        console.error('Failed to create Stripe customer.');
        captureMessage('Failed to create Stripe customer.', {
          level: 'error',
          user: { id: user.id, email: user.email },
        });
      }

      const posthog = PostHogClient();

      const login_type =
        user.app_metadata.provider === 'email' ? 'email' : 'social';

      posthog.capture({
        distinctId: user.id,
        event: 'sign-up',
        properties: {
          login_type,
          //   is_free_trial: true,
        },
      });
      await posthog.shutdown();
    }

    if (isSafeRedirectPath(redirectTo)) {
      return createOauthRedirectResponse(`${origin}${redirectTo}`);
    }

    // URL to redirect to after sign up process completes
    return createOauthRedirectResponse(
      `${origin}/${routing.defaultLocale}/dashboard`,
    );
  } catch (error) {
    if (isPkceCodeVerifierMissingError(error)) {
      return reportPkceCodeVerifierMissing(error);
    }

    captureException(error, {
      tags: {
        area: 'auth',
        flow: 'oauth-callback',
      },
      extra: {
        redirectTo,
        locale,
        ...oauthCodeContext,
        ...oauthCookieContext,
      },
    });

    return NextResponse.redirect(`${origin}${loginPath}`);
  }
}
