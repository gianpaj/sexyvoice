import { createHmac, timingSafeEqual } from 'node:crypto';

import { AUTH_CALLBACK_COOKIE_NAME } from './constants';

export const AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS = 60;

function getAuthCallbackMarkerSecret(): string | null {
  return (
    process.env.OAUTH_CALLBACK_MARKER_SECRET ??
    process.env.API_KEY_HMAC_SECRET ??
    null
  );
}

function createAuthCallbackMarkerSignature(expiresAt: number): string | null {
  const secret = getAuthCallbackMarkerSecret();
  if (!secret) {
    return null;
  }

  return createHmac('sha256', secret)
    .update(`${AUTH_CALLBACK_COOKIE_NAME}.${expiresAt}`)
    .digest('hex');
}

export function createAuthCallbackMarkerValue(now = Date.now()): string | null {
  const expiresAt = now + AUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS * 1000;
  const signature = createAuthCallbackMarkerSignature(expiresAt);

  if (!signature) {
    return null;
  }

  return `${expiresAt}.${signature}`;
}

export function verifyAuthCallbackMarkerValue(
  value: string | undefined,
  now = Date.now(),
): boolean {
  if (!value) {
    return false;
  }

  const parts = value.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [rawExpiresAt, providedSignature] = parts;
  const expiresAt = Number(rawExpiresAt);

  if (!(providedSignature && Number.isFinite(expiresAt) && expiresAt > now)) {
    return false;
  }

  const expectedSignature = createAuthCallbackMarkerSignature(expiresAt);
  if (!expectedSignature) {
    return false;
  }

  const providedBuffer = Buffer.from(providedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
