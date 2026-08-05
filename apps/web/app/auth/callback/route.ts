import { createHash } from 'node:crypto';
import { captureException, captureMessage } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import PostHogClient from '@/lib/posthog';
import { createOrRetrieveCustomer } from '@/lib/stripe/stripe-admin';
import { OAUTH_CALLBACK_COOKIE_NAME } from '@/lib/supabase/constants';
import {
  createOauthCallbackMarkerValue,
  OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
  verifyOauthCallbackMarkerValue,
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
  const cookies = parseCookieHeader(cookieHeader);
  const cookieNames = cookies.map(({ name }) => name);
  const supabaseCookieNames = cookieNames.filter((name) => {
    const lowerName = name.toLowerCase();
    return lowerName.startsWith('sb-') || lowerName.includes('supabase');
  });
  const oauthCallbackMarkerCookie = cookies.find(
    ({ name }) => name === OAUTH_CALLBACK_COOKIE_NAME,
  );

  return {
    cookieCount: cookieNames.length,
    hasCookieHeader: Boolean(cookieHeader),
    hasOauthCallbackMarkerCookie: cookieNames.includes(
      OAUTH_CALLBACK_COOKIE_NAME,
    ),
    hasSupabaseAuthCookie: supabaseCookieNames.some((name) =>
      name.includes('auth-token'),
    ),
    hasSupabaseCodeVerifierCookie: supabaseCookieNames.some((name) =>
      name.includes('code-verifier'),
    ),
    hasValidOauthCallbackMarkerCookie: verifyOauthCallbackMarkerValue(
      oauthCallbackMarkerCookie?.value,
    ),
    supabaseCookieCount: supabaseCookieNames.length,
  };
};

const clearOauthCallbackMarkerCookie = (response: NextResponse) => {
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

const createOauthRedirectResponse = (url: string) => {
  const response = NextResponse.redirect(url);
  const markerValue = createOauthCallbackMarkerValue();

  if (markerValue) {
    response.cookies.set({
      httpOnly: true,
      maxAge: OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
      name: OAUTH_CALLBACK_COOKIE_NAME,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      value: markerValue,
    });
  }

  return response;
};

const createOauthFailureRedirectResponse = (url: string) =>
  clearOauthCallbackMarkerCookie(NextResponse.redirect(url));

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
  const createSafePostAuthRedirectResponse = () =>
    createOauthRedirectResponse(
      isSafeRedirectPath(redirectTo)
        ? `${origin}${redirectTo}`
        : `${origin}/${routing.defaultLocale}/dashboard`,
    );
  const reportKnownOauthCallbackFailure = (
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
          ...oauthCookieContext,
          errorCode: getErrorStringProperty(error, 'code') || null,
          errorMessage: getErrorMessage(error),
          errorName: getErrorStringProperty(error, 'name') || null,
        },
        flow: 'oauth-callback',
      });
    }

    return createOauthFailureRedirectResponse(`${origin}${loginPath}`);
  };
  try {
    if (!code) {
      return createOauthFailureRedirectResponse(`${origin}${loginPath}`);
    }

    // Short-circuit a replayed/refreshed callback: the HMAC-signed marker cookie
    // (60s TTL) proves we already exchanged the one-time `code` successfully, while
    // the missing code-verifier cookie confirms the PKCE flow is no longer active.
    // Invariant: the Supabase auth-token cookie written by that first exchange is
    // still present, so downstream middleware reuses the existing session. If that
    // cookie was somehow cleared while the marker survived, the dashboard simply
    // redirects back to login — safe either way.
    if (
      oauthCookieContext.hasValidOauthCallbackMarkerCookie &&
      !oauthCookieContext.hasSupabaseCodeVerifierCookie
    ) {
      return createSafePostAuthRedirectResponse();
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
        extra: {
          locale,
          redirectTo,
          ...oauthCodeContext,
          ...oauthCookieContext,
        },
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
        },
      });

      return createOauthFailureRedirectResponse(`${origin}${loginPath}`);
    }

    const email = user?.email;
    if (!email) {
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

      return createOauthFailureRedirectResponse(`${origin}${loginPath}`);
    }

    // Add Stripe customer creation
    if (user) {
      const stripe_id = await createOrRetrieveCustomer(user.id, user.email!);
      if (!stripe_id) {
        console.error('Failed to create Stripe customer.');
        captureMessage('Failed to create Stripe customer.', {
          level: 'error',
          user: { email: user.email, id: user.id },
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
    const knownOauthCallbackFailure = getKnownOauthCallbackFailure(error);
    if (knownOauthCallbackFailure) {
      return reportKnownOauthCallbackFailure(
        knownOauthCallbackFailure.message,
        knownOauthCallbackFailure.errorType,
        error,
      );
    }

    captureException(error, {
      extra: {
        locale,
        redirectTo,
        ...oauthCodeContext,
        ...oauthCookieContext,
      },
      tags: {
        area: 'auth',
        flow: 'oauth-callback',
      },
    });

    return createOauthFailureRedirectResponse(`${origin}${loginPath}`);
  }
}
