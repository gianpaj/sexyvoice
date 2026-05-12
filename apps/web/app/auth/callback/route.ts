import { createHash } from 'node:crypto';
import { captureException, captureMessage } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { recordSignupSideEffects } from '@/lib/auth/signup-side-effects';
import {
  createAuthRedirectResponse,
  getLocaleFromRedirectPath,
  getSafeAuthRedirectPath,
} from '@/lib/supabase/auth-redirect';
import { AUTH_CALLBACK_COOKIE_NAME } from '@/lib/supabase/constants';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/src/i18n/routing';

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

const getAuthCallbackCookieContext = (request: Request) => {
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
    hasAuthCallbackMarkerCookie: cookieNames.includes(
      AUTH_CALLBACK_COOKIE_NAME,
    ),
  };
};

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;
  const redirectTo = requestUrl.searchParams.get('redirect_to');
  const safeRedirectPath = getSafeAuthRedirectPath(redirectTo, origin);
  const locale = getLocaleFromRedirectPath(safeRedirectPath);
  const loginPath = `/${locale}/login`;
  const oauthCodeContext = getOauthCodeFingerprint(code);
  const authCookieContext = getAuthCallbackCookieContext(request);
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
        ...authCookieContext,
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
          ...authCookieContext,
        },
      });

      return NextResponse.redirect(`${origin}${loginPath}`);
    }

    if (!user?.email) {
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

    await recordSignupSideEffects(
      user,
      user.app_metadata.provider === 'email' ? 'email' : 'social',
    );

    if (safeRedirectPath) {
      return createAuthRedirectResponse(`${origin}${safeRedirectPath}`);
    }

    // URL to redirect to after sign up process completes
    return createAuthRedirectResponse(
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
        ...authCookieContext,
      },
    });

    return NextResponse.redirect(`${origin}${loginPath}`);
  }
}
