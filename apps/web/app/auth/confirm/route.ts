import { captureException, captureMessage } from '@sentry/nextjs';
import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import {
  createAuthRedirectResponse,
  getLocaleFromRedirectPath,
  getSafeAuthRedirectPath,
} from '@/lib/supabase/auth-redirect';
import { createClient } from '@/lib/supabase/server';

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

const isEmailOtpType = (value: string | null): value is EmailOtpType =>
  Boolean(value && EMAIL_OTP_TYPES.has(value as EmailOtpType));

const getDefaultSuccessPath = (type: EmailOtpType, locale: string) =>
  type === 'recovery'
    ? `/${locale}/protected/update-password`
    : `/${locale}/dashboard`;

export async function GET(request: Request) {
  // Email auth links use token_hash + verifyOtp so confirmation and recovery
  // links do not depend on a browser-local PKCE code verifier.
  // https://supabase.com/docs/guides/auth/auth-email-templates#redirecting-the-user-to-a-server-side-endpoint
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const redirectTo =
    requestUrl.searchParams.get('redirect_to') ??
    requestUrl.searchParams.get('next');
  const safeRedirectPath = getSafeAuthRedirectPath(redirectTo, origin);
  const locale = getLocaleFromRedirectPath(safeRedirectPath);
  const loginPath = `/${locale}/login`;

  if (!(tokenHash && isEmailOtpType(type))) {
    captureMessage(
      'Email auth confirmation link missing required parameters.',
      {
        level: 'warning',
        tags: {
          area: 'auth',
          flow: 'email-auth-confirm',
          error_type: 'missing-confirmation-params',
        },
        extra: {
          hasTokenHash: Boolean(tokenHash),
          type,
          redirectTo,
          safeRedirectPath,
        },
      },
    );

    return NextResponse.redirect(`${origin}${loginPath}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    captureException(error, {
      tags: {
        area: 'auth',
        flow: 'email-auth-confirm',
        error_type: 'verify-otp-failed',
      },
      extra: {
        type,
        redirectTo,
        safeRedirectPath,
      },
    });

    return NextResponse.redirect(`${origin}${loginPath}`);
  }

  return createAuthRedirectResponse(
    `${origin}${safeRedirectPath ?? getDefaultSuccessPath(type, locale)}`,
  );
}
