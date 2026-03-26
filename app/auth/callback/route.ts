import { createHash } from 'node:crypto';
import { captureException, captureMessage } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { i18n } from '@/lib/i18n/i18n-config';
import PostHogClient from '@/lib/posthog';
import { createOrRetrieveCustomer } from '@/lib/stripe/stripe-admin';
import { OAUTH_CALLBACK_COOKIE_NAME } from '@/lib/supabase/constants';
import {
  createOauthCallbackMarkerValue,
  OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/supabase/oauth-callback-marker';
import { createClient } from '@/lib/supabase/server';

const isSafeRedirectPath = (value: string | null) =>
  Boolean(value?.startsWith('/') && !value.startsWith('//'));

const getLocaleFromRedirectPath = (redirectPath: string | null) => {
  const locale = redirectPath?.split('/')[1];

  return i18n.locales.includes(locale as (typeof i18n.locales)[number])
    ? locale
    : i18n.defaultLocale;
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

const createOauthRedirectResponse = (url: string) => {
  const response = NextResponse.redirect(url);
  const markerValue = createOauthCallbackMarkerValue();

  console.log('OAuth callback redirect response created', {
    redirectUrl: url,
    hasOauthCallbackMarker: Boolean(markerValue),
    oauthCallbackMarkerLength: markerValue?.length ?? 0,
  });

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

    console.log('OAuth callback marker cookie set', {
      redirectUrl: url,
      cookieName: OAUTH_CALLBACK_COOKIE_NAME,
      oauthCallbackMarkerLength: markerValue.length,
      cookieMaxAgeSeconds: OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS,
    });
  } else {
    console.warn('OAuth callback marker cookie was not set', {
      redirectUrl: url,
      cookieName: OAUTH_CALLBACK_COOKIE_NAME,
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
      captureException(exchangeError, {
        tags: {
          area: 'auth',
          flow: 'oauth-callback',
        },
        extra: {
          redirectTo,
          locale,
          ...oauthCodeContext,
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
      `${origin}/${i18n.defaultLocale}/dashboard`,
    );
  } catch (error) {
    captureException(error, {
      tags: {
        area: 'auth',
        flow: 'oauth-callback',
      },
      extra: {
        redirectTo,
        locale,
        ...oauthCodeContext,
      },
    });

    return NextResponse.redirect(`${origin}${loginPath}`);
  }
}
