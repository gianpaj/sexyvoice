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
  property: 'code' | 'message' | 'name',
) => {
  if (error instanceof Error && property !== 'code') {
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

const isExpiredAuthFlowStateError = (error: unknown) => {
  const errorName = getErrorStringProperty(error, 'name');
  const errorCode = getErrorStringProperty(error, 'code');
  const errorMessage = getErrorStringProperty(error, 'message').toLowerCase();

  return (
    (errorName === 'AuthApiError' &&
      (errorCode === 'flow_state_expired' ||
        errorCode === 'flow_state_not_found')) ||
    errorMessage.includes('invalid flow state') ||
    errorMessage.includes('flow state has expired')
  );
};

const isCodeChallengeMismatchError = (error: unknown) => {
  const errorName = getErrorStringProperty(error, 'name');
  const errorMessage = getErrorStringProperty(error, 'message').toLowerCase();

  return (
    errorName === 'AuthApiError' &&
    errorMessage.includes(
      'code challenge does not match previously saved code verifier',
    )
  );
};

function getKnownOauthCallbackFailure(error: unknown): {
  errorType: string;
  message: string;
} | null {
  if (isPkceCodeVerifierMissingError(error)) {
    return {
      errorType: 'pkce-code-verifier-missing',
      message: 'OAuth callback missing PKCE code verifier.',
    };
  }

  if (isExpiredAuthFlowStateError(error)) {
    return {
      errorType: 'flow-state-expired',
      message: 'OAuth callback flow state expired.',
    };
  }

  if (isCodeChallengeMismatchError(error)) {
    return {
      errorType: 'code-challenge-mismatch',
      message: 'OAuth callback code challenge mismatch.',
    };
  }

  return null;
}

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
  const oauthCookieContext = getOauthCallbackCookieContext(request);
  const reportKnownOauthCallbackFailure = (
    message: string,
    errorType: string,
    error: unknown,
  ) => {
    console.warn(message, {
      area: 'auth',
      errorType,
      flow: 'oauth-callback',
      extra: {
        redirectTo,
        locale,
        ...oauthCodeContext,
        ...oauthCookieContext,
        errorCode: getErrorStringProperty(error, 'code') || null,
        errorMessage: getErrorMessage(error),
        errorName: getErrorStringProperty(error, 'name') || null,
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
      const knownOauthCallbackFailure =
        getKnownOauthCallbackFailure(exchangeError);
      if (knownOauthCallbackFailure) {
        return reportKnownOauthCallbackFailure(
          knownOauthCallbackFailure.message,
          knownOauthCallbackFailure.errorType,
          exchangeError,
        );
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
    const knownOauthCallbackFailure = getKnownOauthCallbackFailure(error);
    if (knownOauthCallbackFailure) {
      return reportKnownOauthCallbackFailure(
        knownOauthCallbackFailure.message,
        knownOauthCallbackFailure.errorType,
        error,
      );
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
