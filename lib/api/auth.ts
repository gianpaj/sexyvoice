import { createHash, randomBytes } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

const API_KEY_PREFIX = 'sk_live_';
const API_KEY_RANDOM_LENGTH = 32;
const API_KEY_PREFIX_LENGTH = 12;
const API_KEY_REGEX = /^sk_live_[A-Za-z0-9]{32}$/;

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

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
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
    .select('id, user_id, key_hash, is_active, expires_at')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
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
