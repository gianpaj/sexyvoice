import { isDisposableEmail } from 'disposable-email-domains-js';
import { NextResponse } from 'next/server';
import z from 'zod';

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

  // Try parsing as JSON first
  try {
    return JSON.parse(errorMessage);
  } catch {
    // Not JSON, continue with pattern matching
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

export async function POST(request: Request) {
  const supabase = await createClient();

  const { email, password } = await request.json();

  const schema = z.object({
    email: z.email(),
    password: z.string().min(6).max(25),
  });

  const result = schema.safeParse({ email, password });

  if (!result.success) {
    const errors = JSON.parse(result.error.message);
    return NextResponse.json(
      { error: { message: errors[0]?.message || 'Validation failed' } },
      { status: 400 },
    );
  }

  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: { message: 'VALIDATION_ERROR_DISPOSABLE_EMAIL' } },
      { status: 400 },
    );
  }

  const { error: signUpError, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (signUpError || !data.user) {
    return NextResponse.json(
      {
        error: parseSignUpError(signUpError?.message),
        data,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { data: { message: 'User created' } },
    { status: 201 },
  );
}
