import { describe, expect, test } from 'vitest';

import { cloneProviderCost, estimateCloneCredits } from '@/lib/clone/pricing';

describe('estimateCloneCredits', () => {
  test('reserves 11 times the base speech estimate', () => {
    // 2 words read at 100 words a minute: 1.2 s × 10 credits × 11.
    expect(estimateCloneCredits('Hello world')).toBe(132);
  });

  test('is free for blank text', () => {
    expect(estimateCloneCredits('   ')).toBe(0);
  });
});

describe('cloneProviderCost', () => {
  const text = 'a'.repeat(1000);

  test('prices Voxtral 3.0 per character', () => {
    expect(cloneProviderCost('mistral', text)).toBe(0.013);
  });

  test('prices Inworld per character', () => {
    expect(cloneProviderCost('inworld', text)).toBeCloseTo(0.0175);
  });

  test('prices a Chatterbox run at a flat rate', () => {
    expect(cloneProviderCost('replicate', text)).toBe(0.0121);
  });

  test('preserves the unknown cost for missing text', () => {
    expect(cloneProviderCost('mistral', '')).toBe(-1);
  });
});
