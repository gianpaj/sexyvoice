import { createHash } from 'node:crypto';
import { captureException, captureMessage } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { recordSignupSideEffects } from '@/lib/auth/signup-side-effects';
import { verifyAuthCallbackMarkerValue } from '@/lib/supabase/auth-callback-marker';
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
      codeFingerprint: null,
      codeLength: 0,
      hasCode: false,
    };
  }

  return {
    codeFingerprint: createHash('sha256')
      .update(code)
      .digest('hex')
      .slice(0, 12),
    codeLength: code.length,
    hasCode: true,
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

const parseCookieHeader = (cookieHeader: string) =>
  cookieHeader
    .split(';')
    .map((cookie) => {
      const [rawName, ...rawValueParts] = cookie.split('=');
      const name = rawName?.trim();
      const value = rawValueParts.join('=').trim();

      return name ? { name, value } : null;
    })
    .filter((cookie): cookie is { name: string; value: string } =>
      Boolean(cookie),
    );

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

function getKnownAuthCallbackFailure(error: unknown): {
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

const getAuthCallbackCookieContext = (request: Request) => {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = parseCookieHeader(cookieHeader);
  const cookieNames = cookies.map(({ name }) => name);
  const supabaseCookieNames = cookieNames.filter((name) => {
    const lowerName = name.toLowerCase();
    return lowerName.startsWith('sb-') || lowerName.includes('supabase');
  });
  const authCallbackMarkerCookie = cookies.find(
    ({ name }) => name === AUTH_CALLBACK_COOKIE_NAME,
  );

  return {
    cookieCount: cookieNames.length,
    hasCookieHeader: Boolean(cookieHeader),
    hasAuthCallbackMarkerCookie: cookieNames.includes(
      AUTH_CALLBACK_COOKIE_NAME,
    ),
    hasSupabaseAuthCookie: supabaseCookieNames.some((name) =>
      name.includes('auth-token'),
    ),
    hasSupabaseCodeVerifierCookie: supabaseCookieNames.some((name) =>
      /^sb-.+-auth-token-code-verifier(?:\.\d+)?$/.test(name),
    ),
    hasValidAuthCallbackMarkerCookie: verifyAuthCallbackMarkerValue(
      authCallbackMarkerCookie?.value,
    ),
    supabaseCookieCount: supabaseCookieNames.length,
  };
};

const clearAuthCallbackMarkerCookie = (response: NextResponse) => {
  response.cookies.set({
    httpOnly: true,
    maxAge: 0,
    name: AUTH_CALLBACK_COOKIE_NAME,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    value: '',
  });

  return response;
};

const createOauthFailureRedirectResponse = (url: string, headers: Headers) =>
  clearAuthCallbackMarkerCookie(NextResponse.redirect(url, { headers }));

export async function GET(request: Request) {
  const responseHeaders = new Headers();
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
  const createSafePostAuthRedirectResponse = () =>
    createAuthRedirectResponse(
      safeRedirectPath
        ? `${origin}${safeRedirectPath}`
        : `${origin}/${routing.defaultLocale}/dashboard`,
      responseHeaders,
    );
  const reportKnownAuthCallbackFailure = (
    message: string,
    errorType: string,
    error: unknown,
  ) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(message, {
        area: 'auth',
        errorType,
        extra: {
          locale,
          redirectTo,
          ...oauthCodeContext,
          ...authCookieContext,
          errorCode: getErrorStringProperty(error, 'code') || null,
          errorMessage: getErrorMessage(error),
          errorName: getErrorStringProperty(error, 'name') || null,
        },
        flow: 'oauth-callback',
      });
    }

    return createOauthFailureRedirectResponse(
      `${origin}${loginPath}`,
      responseHeaders,
    );
  };
  try {
    if (!code) {
      return createOauthFailureRedirectResponse(
        `${origin}${loginPath}`,
        responseHeaders,
      );
    }

    // A signed completion marker and no legacy verifier allow callback replays.
    // exchangeCodeForSession(code) consumes only the legacy verifier; the SDK's
    // per-flow slots and index can remain and must not block this shortcut.
    // Dashboard middleware still validates the session before granting access.
    if (
      authCookieContext.hasValidAuthCallbackMarkerCookie &&
      !authCookieContext.hasSupabaseCodeVerifierCookie
    ) {
      return createSafePostAuthRedirectResponse();
    }

    const supabase = await createClient(responseHeaders);
    const {
      data: { user },
      error: exchangeError,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      const knownAuthCallbackFailure =
        getKnownAuthCallbackFailure(exchangeError);
      if (knownAuthCallbackFailure) {
        return reportKnownAuthCallbackFailure(
          knownAuthCallbackFailure.message,
          knownAuthCallbackFailure.errorType,
          exchangeError,
        );
      }

      captureException(exchangeError, {
        extra: {
          locale,
          redirectTo,
          ...oauthCodeContext,
          ...authCookieContext,
        },
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
        },
      });

      return createOauthFailureRedirectResponse(
        `${origin}${loginPath}`,
        responseHeaders,
      );
    }

    if (!user?.email) {
      captureMessage('OAuth callback completed without a user email.', {
        extra: {
          locale,
          redirectTo,
          userId: user?.id ?? null,
        },
        level: 'error',
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
        },
      });

      return createOauthFailureRedirectResponse(
        `${origin}${loginPath}`,
        responseHeaders,
      );
    }

    await recordSignupSideEffects(
      user,
      user.app_metadata.provider === 'email' ? 'email' : 'social',
    );

    if (safeRedirectPath) {
      return createAuthRedirectResponse(
        `${origin}${safeRedirectPath}`,
        responseHeaders,
      );
    }

    // URL to redirect to after sign up process completes
    return createAuthRedirectResponse(
      `${origin}/${routing.defaultLocale}/dashboard`,
      responseHeaders,
    );
  } catch (error) {
    const knownAuthCallbackFailure = getKnownAuthCallbackFailure(error);
    if (knownAuthCallbackFailure) {
      return reportKnownAuthCallbackFailure(
        knownAuthCallbackFailure.message,
        knownAuthCallbackFailure.errorType,
        error,
      );
    }

    captureException(error, {
      extra: {
        locale,
        redirectTo,
        ...oauthCodeContext,
        ...authCookieContext,
      },
      tags: {
        area: 'auth',
        flow: 'oauth-callback',
      },
    });

    return createOauthFailureRedirectResponse(
      `${origin}${loginPath}`,
      responseHeaders,
    );
  }
}
