import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const CALLBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const EXCHANGE_TOKEN_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export const CLI_LOGIN_SESSION_TTL_MS = 5 * 60 * 1000;

function getEncryptionKey(): Buffer {
  const secret = process.env.CLI_LOGIN_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      'Missing env.CLI_LOGIN_ENCRYPTION_SECRET for CLI login exchange flow',
    );
  }
  return createHash('sha256').update(secret).digest();
}

export function generateCliExchangeToken(): string {
  return randomBytes(EXCHANGE_TOKEN_BYTES).toString('base64url');
}

export function hashCliExchangeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function encryptCliApiKey(apiKey: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

export function decryptCliApiKey(payload: string): string {
  const [ivEncoded, encryptedEncoded, tagEncoded] = payload.split('.');
  if (!(ivEncoded && encryptedEncoded && tagEncoded)) {
    throw new Error('Invalid encrypted CLI payload');
  }

  const iv = Buffer.from(ivEncoded, 'base64url');
  const encrypted = Buffer.from(encryptedEncoded, 'base64url');
  const tag = Buffer.from(tagEncoded, 'base64url');

  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
    throw new Error('Invalid encrypted CLI payload');
  }

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

export function isAllowedCliCallbackUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' && CALLBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function buildCliCallbackRedirectUrl(
  callbackUrl: string,
  exchangeToken: string,
  state: string,
): string {
  const url = new URL(callbackUrl);
  url.searchParams.set('exchange_token', exchangeToken);
  url.searchParams.set('state', state);
  return url.toString();
}
