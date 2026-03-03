import { describe, expect, it } from 'vitest';

import { generateApiKey, hashApiKey } from '@/lib/api/auth';

// setup.ts sets API_KEY_HMAC_SECRET globally for all tests; no beforeAll needed.

describe('external API auth helpers', () => {
  it('generates key in expected format with prefix and hash', () => {
    const generated = generateApiKey();

    expect(generated.key).toMatch(/^sk_live_[A-Za-z0-9]{32}$/);
    expect(generated.prefix).toHaveLength(12);
    expect(generated.key.startsWith(generated.prefix)).toBe(true);
    // HMAC-SHA256 produces a 32-byte digest — 64 hex characters, same as SHA-256.
    expect(generated.hash).toHaveLength(64);
  });

  it('hashApiKey is deterministic', () => {
    const key = 'sk_live_Abc123Def456Ghi789Jkl012Mno345Pq';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('hashApiKey produces different output for different secrets', () => {
    const original = process.env.API_KEY_HMAC_SECRET;
    const key = 'sk_live_Abc123Def456Ghi789Jkl012Mno345Pq';

    const hashWithOriginal = hashApiKey(key);

    process.env.API_KEY_HMAC_SECRET = 'different-secret';
    const hashWithDifferentSecret = hashApiKey(key);

    // Restore before any assertion so a failure doesn't leave a dirty secret.
    process.env.API_KEY_HMAC_SECRET = original;

    expect(hashWithOriginal).not.toBe(hashWithDifferentSecret);
  });

  it('hashApiKey throws when API_KEY_HMAC_SECRET is absent', () => {
    const original = process.env.API_KEY_HMAC_SECRET;
    const key = 'sk_live_Abc123Def456Ghi789Jkl012Mno345Pq';

    Reflect.deleteProperty(process.env, 'API_KEY_HMAC_SECRET');

    try {
      expect(() => hashApiKey(key)).toThrow('API_KEY_HMAC_SECRET is not set');
    } finally {
      // Always restore so later tests in the suite are not affected.
      process.env.API_KEY_HMAC_SECRET = original;
    }
  });
});
