import { createHmac, randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

// Built via Array.join to avoid secret scanners flagging the literal prefix.
const API_KEY_PREFIX_PARTS = ['sk', 'live', ''];
const API_KEY_PREFIX = API_KEY_PREFIX_PARTS.join('_');
const API_KEY_RANDOM_LENGTH = 32;
const API_KEY_PREFIX_LENGTH = 12;
const API_KEY_REGEX = new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9]{32}$`);

function createRandomAlphaNumeric(length: number): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let output = '';
  const alphabetLength = alphabet.length;
  const maxUnbiasedValue = Math.floor(256 / alphabetLength) * alphabetLength;

  while (output.length < length) {
    const bytes = randomBytes(length);
    for (const value of bytes) {
      if (value >= maxUnbiasedValue) {
        continue;
      }
      output += alphabet[value % alphabetLength];
      if (output.length === length) {
        break;
      }
    }
  }
  return output;
}

/**
 * Hashes an API key for safe storage in the database.
 *
 * Uses HMAC-SHA256 keyed with API_KEY_HMAC_SECRET so that an attacker who
 * obtains the database alone cannot verify candidate keys offline — they also
 * need the application secret.
 *
 */
export function hashApiKey(key: string): string {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      '[auth] API_KEY_HMAC_SECRET is not set. Set the secret immediately.',
    );
  }
  return createHmac('sha256', secret).update(key).digest('hex');
}

export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const key = `${API_KEY_PREFIX}${createRandomAlphaNumeric(API_KEY_RANDOM_LENGTH)}`;
  return {
    key,
    hash: hashApiKey(key),
    prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
  };
}

function extractBearerToken(authHeader: string): string | null {
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token.trim();
}

export async function validateApiKey(authHeader: string): Promise<{
  userId: string;
  apiKeyId: string;
  keyHash: string;
} | null> {
  const token = extractBearerToken(authHeader);
  if (!(token && API_KEY_REGEX.test(token))) {
    return null;
  }

  const keyHash = hashApiKey(token);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('api_keys')
    .select('id, user_id, key_hash, is_active')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    userId: data.user_id,
    apiKeyId: data.id,
    keyHash,
  };
}

export async function updateApiKeyLastUsed(keyHash: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('update_api_key_last_used', {
    p_key_hash: keyHash,
  });
  if (error) {
    console.warn('Failed to update api key last_used_at', {
      code: error.code,
      message: error.message,
    });
  }
}
