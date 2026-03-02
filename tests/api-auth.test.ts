import { describe, expect, it } from 'vitest';

import { generateApiKey, hashApiKey } from '@/lib/api/auth';

describe('external API auth helpers', () => {
  it('generates key in expected format with prefix and hash', () => {
    const generated = generateApiKey();

    expect(generated.key).toMatch(/^sk_live_[A-Za-z0-9]{32}$/);
    expect(generated.prefix).toHaveLength(12);
    expect(generated.key.startsWith(generated.prefix)).toBe(true);
    expect(generated.hash).toHaveLength(64);
  });

  it('hashApiKey is deterministic', () => {
    const key = 'sk_live_Abc123Def456Ghi789Jkl012Mno345Pq';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });
});
