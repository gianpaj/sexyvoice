import { captureException, captureMessage } from '@sentry/nextjs';
import { createClient as createIsolatedClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import {
  createAuthRedirectResponse,
  getLocaleFromAuthHints,
  getSafeAuthRedirectPath,
} from '@/lib/supabase/auth-redirect';
import {
  createEmailConfirmation,
  EMAIL_CONFIRMATION_COOKIE,
  EMAIL_CONFIRMATION_MAX_AGE,
  type EmailConfirmation,
  isEmailOtpType,
  matchesConfirmationCsrf,
  readEmailConfirmation,
} from '@/lib/supabase/email-confirmation';
import { createClient } from '@/lib/supabase/server';

const responseHeaders = {
  'cache-control': 'private, no-store',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

const pendingCookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

function clearPending(response: NextResponse) {
  response.cookies.set(EMAIL_CONFIRMATION_COOKIE, '', {
    ...pendingCookieOptions,
    maxAge: 0,
  });
  return response;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });

async function confirmationPage(
  pending: EmailConfirmation,
  message?: 'failed' | 'emailChangeConfirmed',
) {
  const t = await getTranslations({
    locale: pending.locale,
    namespace: 'auth.confirm',
  });
  const form = message
    ? `<p role="status">${escapeHtml(t(message))}</p><a href="/${pending.locale}/login">${escapeHtml(t('backToLogin'))}</a>`
    : `<p>${escapeHtml(t('description'))}</p>
<form action="/auth/confirm" method="post">
<input type="hidden" name="csrf" value="${pending.csrf}">
<label for="email">${escapeHtml(t('email'))}</label>
<input id="email" name="email" type="email" autocomplete="email" maxlength="254" required>
<label class="consent"><input type="checkbox" name="intent" value="confirm" required><span>${escapeHtml(t('consent'))}</span></label>
<button type="submit">${escapeHtml(t('submit'))}</button>
</form>`;
  return new NextResponse(
    `<!doctype html><html lang="${pending.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(t('title'))}</title>
<style>body{font:16px system-ui,sans-serif;max-width:28rem;margin:10vh auto;padding:1.5rem}h1{font-size:1.5rem}form{display:grid;gap:1rem}input[type=email],button{font:inherit;padding:.65rem}.consent{display:flex;align-items:start;gap:.5rem}</style></head><body><h1>${escapeHtml(t('title'))}</h1>${form}</body></html>`,
    {
      status: message === 'failed' ? 400 : 200,
      headers: {
        ...responseHeaders,
        'referrer-policy': 'same-origin',
        'content-type': 'text/html; charset=utf-8',
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const redirectPath = getSafeAuthRedirectPath(
    url.searchParams.get('redirect_to') ?? url.searchParams.get('next'),
    url.origin,
  );
  const locale = getLocaleFromAuthHints({
    acceptLanguage: request.headers.get('accept-language'),
    locale: url.searchParams.get('lang'),
    redirectPath,
  });

  if (tokenHash && isEmailOtpType(type)) {
    const value = createEmailConfirmation({
      tokenHash,
      type,
      locale,
      redirectPath,
    });
    if (!value) {
      captureMessage('Email confirmation state could not be created.', {
        level: 'error',
        tags: { area: 'auth', flow: 'email-auth-confirm' },
      });
      return new NextResponse(null, { status: 400, headers: responseHeaders });
    }
    const response = NextResponse.redirect(`${url.origin}/auth/confirm`, {
      headers: responseHeaders,
    });
    response.cookies.set(EMAIL_CONFIRMATION_COOKIE, value, {
      ...pendingCookieOptions,
      maxAge: EMAIL_CONFIRMATION_MAX_AGE,
    });
    return response;
  }

  // Malformed links must not silently resume a different pending link.
  if (url.search) {
    return NextResponse.redirect(`${url.origin}/${locale}/login`, {
      headers: responseHeaders,
    });
  }
  const pending = readEmailConfirmation(
    (await cookies()).get(EMAIL_CONFIRMATION_COOKIE)?.value,
  );
  return pending
    ? confirmationPage(pending)
    : NextResponse.redirect(`${url.origin}/${locale}/login`, {
        headers: responseHeaders,
      });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) {
    return new NextResponse(null, { status: 403, headers: responseHeaders });
  }
  const pending = readEmailConfirmation(
    (await cookies()).get(EMAIL_CONFIRMATION_COOKIE)?.value,
  );
  if (!pending) {
    return new NextResponse(null, { status: 403, headers: responseHeaders });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new NextResponse(null, { status: 400, headers: responseHeaders });
  }
  const email = z.email().max(254).safeParse(form.get('email'));
  if (
    !matchesConfirmationCsrf(form.get('csrf'), pending.csrf) ||
    form.get('intent') !== 'confirm' ||
    !email.success
  ) {
    return new NextResponse(null, { status: 403, headers: responseHeaders });
  }

  // Verify outside cookie storage so an unrelated account's link cannot replace
  // the browser session before the explicitly confirmed identity is checked.
  const isolated = createIsolatedClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { data, error } = await isolated.auth.verifyOtp({
    token_hash: pending.tokenHash,
    type: pending.type,
  });
  if (error) return clearPending(await confirmationPage(pending, 'failed'));
  if (!data.session) {
    return clearPending(
      await confirmationPage(
        pending,
        pending.type === 'email_change' ? 'emailChangeConfirmed' : 'failed',
      ),
    );
  }
  const user = data.session.user;
  if (user.email?.toLowerCase() !== email.data.toLowerCase()) {
    return clearPending(await confirmationPage(pending, 'failed'));
  }

  const headers = new Headers(responseHeaders);
  const supabase = await createClient(headers);
  const installed = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (installed.error)
    return clearPending(await confirmationPage(pending, 'failed'));

  if (pending.type === 'signup' || pending.type === 'email') {
    try {
      const { recordSignupSideEffects } = await import(
        '@/lib/auth/signup-side-effects'
      );
      await recordSignupSideEffects(user, 'email');
    } catch (error) {
      captureException(error, {
        tags: {
          area: 'auth',
          flow: 'email-auth-confirm',
          error_type: 'signup-side-effects-failed',
        },
      });
    }
  }
  const fallback =
    pending.type === 'recovery'
      ? `/${pending.locale}/protected/update-password`
      : `/${pending.locale}/dashboard`;
  const redirect =
    getSafeAuthRedirectPath(pending.redirectPath, url.origin) ?? fallback;
  return clearPending(
    createAuthRedirectResponse(`${url.origin}${redirect}`, headers, 303),
  );
}
