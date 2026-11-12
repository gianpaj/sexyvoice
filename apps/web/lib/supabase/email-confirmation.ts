import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EmailOtpType } from '@supabase/supabase-js';
import { z } from 'zod';

import { i18n } from '@/lib/i18n/i18n-config';
import { getAuthCallbackMarkerSecret } from './auth-callback-marker';

export const EMAIL_CONFIRMATION_COOKIE =
  process.env.NODE_ENV === 'production'
    ? '__Host-sv_email_confirmation'
    : 'sv_email_confirmation';
export const EMAIL_CONFIRMATION_MAX_AGE = 10 * 60;
const MAX_COOKIE_LENGTH = 3000;
const SIGNING_PURPOSE = 'email-confirmation.v1';

const otpType = z.enum([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] satisfies EmailOtpType[]);

const pendingSchema = z.object({
  tokenHash: z.string().min(1).max(512),
  type: otpType,
  locale: z.enum(i18n.locales),
  redirectPath: z.string().max(1024).nullable(),
  csrf: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.number().int().positive(),
});

export type EmailConfirmation = z.infer<typeof pendingSchema>;
export const isEmailOtpType = (
  value: unknown,
): value is EmailConfirmation['type'] => otpType.safeParse(value).success;

const signature = (payload: string) => {
  const secret = getAuthCallbackMarkerSecret();
  return secret
    ? createHmac('sha256', secret)
        .update(`${SIGNING_PURPOSE}.${payload}`)
        .digest('hex')
    : null;
};

export function createEmailConfirmation(
  input: Omit<EmailConfirmation, 'csrf' | 'expiresAt'>,
  now = Date.now(),
): string | null {
  const parsed = pendingSchema.safeParse({
    ...input,
    csrf: randomBytes(32).toString('base64url'),
    expiresAt: now + EMAIL_CONFIRMATION_MAX_AGE * 1000,
  });
  if (!parsed.success) return null;

  const payload = Buffer.from(JSON.stringify(parsed.data)).toString(
    'base64url',
  );
  const signed = signature(payload);
  if (!signed) return null;

  const value = `${payload}.${signed}`;
  return value.length <= MAX_COOKIE_LENGTH ? value : null;
}

export function readEmailConfirmation(
  value: string | undefined,
  now = Date.now(),
): EmailConfirmation | null {
  if (!value || value.length > MAX_COOKIE_LENGTH) return null;
  const parts = value.split('.');
  const [payload, provided] = parts;
  if (
    parts.length !== 2 ||
    !(payload && provided && /^[a-f0-9]{64}$/.test(provided))
  ) {
    return null;
  }
  const expected = signature(payload);
  if (
    !(
      expected &&
      timingSafeEqual(
        Buffer.from(provided, 'hex'),
        Buffer.from(expected, 'hex'),
      )
    )
  ) {
    return null;
  }

  try {
    const parsed = pendingSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString()),
    );
    return parsed.success && parsed.data.expiresAt > now ? parsed.data : null;
  } catch {
    return null;
  }
}

export function matchesConfirmationCsrf(
  value: FormDataEntryValue | null,
  csrf: string,
) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(csrf))
  );
}
