import { NextResponse } from 'next/server';
import z from 'zod';

import { isDisposableEmail } from '@/lib/disposable-email';
import { isE2E } from '@/lib/e2e-mode';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import {
  getRequestOrigin,
} from '@/lib/supabase/auth-redirect';
import { createClient } from '@/lib/supabase/server';

interface ParsedError {
  message: string;
  seconds?: number | null;
}

const ERROR_PATTERNS: Array<{
  match: (message: string) => boolean;
  parse: (message: string) => ParsedError;
}> = [
  {
    match: (msg) =>
      msg.startsWith('For security purposes, you can only request this after'),
    parse: (msg) => {
      const secondsMatch = msg.match(/(\d+)\s+seconds/);
      const seconds = secondsMatch
        ? Number.parseInt(secondsMatch[1], 10)
        : null;
      return { message: 'AUTH_PROVIDER_RATELIMIT', seconds };
    },
  },
  {
    match: (msg) => msg.startsWith('Email already exists'),
    parse: () => ({ message: 'VALIDATION_ERROR_EMAIL_EXISTS' }),
  },
];

function parseSignUpError(
  errorMessage: string | undefined,
): ParsedError | null {
  if (!errorMessage) {
    return null;
  }

  // Check against known error patterns
  for (const { match, parse } of ERROR_PATTERNS) {
    if (match(errorMessage)) {
      return parse(errorMessage);
    }
  }

  // Fallback to raw message
  return { message: errorMessage };
}

const getSignupEmailRedirectTo = (origin: string, lang: Locale) =>
  new URL(`/${lang}/dashboard`, origin).toString();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid request body' } },
      { status: 400 },
    );
  }

  const schema = z.object({
    email: z.email(),
    password: z.string().min(6).max(72),
    lang: z.enum(i18n.locales).default(i18n.defaultLocale),
  });

  const result = schema.safeParse(body);

  if (!result.success) {
    const firstErrorMessage =
      result.error.issues[0]?.message || 'Validation failed';
    return NextResponse.json(
      { error: { message: firstErrorMessage } },
      { status: 400 },
    );
  }

  const { email, password, lang } = result.data;
  const origin = getRequestOrigin(request);
  if (!origin) {
    return NextResponse.json(
      { error: { message: 'Server configuration error' } },
      { status: 500 },
    );
  }

  const emailRedirectTo = getSignupEmailRedirectTo(origin, lang);

  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: { message: 'VALIDATION_ERROR_DISPOSABLE_EMAIL' } },
      { status: 400 },
    );
  }

  if (isE2E()) {
    return NextResponse.json(
      { data: { message: 'User created', emailRedirectTo } },
      { status: 201 },
    );
  }

  const supabase = await createClient();

  const { error: signUpError, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
    },
  });

  if (signUpError || !data.user) {
    const parsedError = parseSignUpError(signUpError?.message);

    const isRateLimitError = parsedError?.message === 'AUTH_PROVIDER_RATELIMIT';
    const hasRetryAfter =
      isRateLimitError &&
      typeof parsedError?.seconds === 'number' &&
      Number.isFinite(parsedError.seconds);

    return NextResponse.json(
      {
        error: parsedError,
        data,
      },
      {
        status: isRateLimitError ? 429 : 400,
        headers: hasRetryAfter
          ? { 'Retry-After': String(parsedError?.seconds) }
          : undefined,
      },
    );
  }

  return NextResponse.json(
    { data: { message: 'User created', emailRedirectTo } },
    { status: 201 },
  );
}
