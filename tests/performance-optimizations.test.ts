import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCacheHash } from '@/lib/utils';

describe('Performance Optimizations', () => {
  describe('generateCacheHash', () => {
    // Note: In test environment, crypto.subtle.digest is mocked to return consistent values
    // This is intentional for testing other features, but we can still verify the function works

    it('should generate consistent 8-character hashes', async () => {
      const input = 'test-voice-hello-world';
      const hash1 = await generateCacheHash(input);
      const hash2 = await generateCacheHash(input);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(8);
      expect(hash1).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should generate hex string hashes', async () => {
      const hash = await generateCacheHash('hello-pietro');
      
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should handle empty strings', async () => {
      const hash = await generateCacheHash('');
      expect(hash).toHaveLength(8);
    });

    it('should handle special characters', async () => {
      const hash = await generateCacheHash('Hello! 你好 @#$%');
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should be efficient for cache key generation', async () => {
      // Test that the function completes quickly
      const start = performance.now();
      await generateCacheHash('test-input-for-timing');
      const duration = performance.now() - start;
      
      // Should complete in less than 10ms even with mocked crypto
      expect(duration).toBeLessThan(10);
    });
  });
});
