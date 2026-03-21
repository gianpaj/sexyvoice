import { createHmac, timingSafeEqual } from 'node:crypto';

import { OAUTH_CALLBACK_COOKIE_NAME } from './constants';

const OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS = 60;

function getOauthCallbackMarkerSecret(): string | null {
  return process.env.API_KEY_HMAC_SECRET ?? null;
}

function createOauthCallbackMarkerSignature(expiresAt: number): string | null {
  const secret = getOauthCallbackMarkerSecret();
  if (!secret) {
    return null;
  }

  return createHmac('sha256', secret)
    .update(`${OAUTH_CALLBACK_COOKIE_NAME}.${expiresAt}`)
    .digest('hex');
}

export function createOauthCallbackMarkerValue(
  now = Date.now(),
): string | null {
  const expiresAt = now + OAUTH_CALLBACK_COOKIE_MAX_AGE_SECONDS * 1000;
  const signature = createOauthCallbackMarkerSignature(expiresAt);

  if (!signature) {
    return null;
  }

  return `${expiresAt}.${signature}`;
}

export function verifyOauthCallbackMarkerValue(
  value: string | undefined,
  now = Date.now(),
): boolean {
  if (!value) {
    return false;
  }

  const [rawExpiresAt, providedSignature] = value.split('.');
  const expiresAt = Number(rawExpiresAt);

  if (!(providedSignature && Number.isFinite(expiresAt) && expiresAt > now)) {
    return false;
  }

  const expectedSignature = createOauthCallbackMarkerSignature(expiresAt);
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
