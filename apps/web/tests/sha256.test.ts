import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateHash } from '@/lib/audio';
import { sha256Hex } from '@/lib/sha256';

describe('SHA-256 helpers', () => {
  const digest = Uint8Array.from({ length: 32 }, (_, index) => index).buffer;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes the complete digest as lowercase hexadecimal', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(digest);

    await expect(sha256Hex(new Uint8Array([1, 2, 3]))).resolves.toBe(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    );
  });

  it('preserves the shortened audio cache key', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(digest);

    await expect(generateHash('hello')).resolves.toBe('00010203');
  });
});
