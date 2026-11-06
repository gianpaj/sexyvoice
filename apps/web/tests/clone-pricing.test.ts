import { describe, expect, test } from 'vitest';

import { estimateCloneCredits, getCloneDollarCost } from '@/lib/clone/pricing';

describe('estimateCloneCredits', () => {
  test('reserves 11 times the base speech estimate', () => {
    // 2 words read at 100 words a minute: 1.2 s × 10 credits × 11.
    expect(estimateCloneCredits('Hello world')).toBe(132);
  });

  test('is free for blank text', () => {
    expect(estimateCloneCredits('   ')).toBe(0);
  });
});

describe('getCloneDollarCost', () => {
  test('estimates Voxtral costs using the selected model', () => {
    const text = 'a'.repeat(1000);
    expect(getCloneDollarCost('mistral', undefined, text)).toBe(0.016);
    expect(
      getCloneDollarCost('mistral', undefined, text, 'voxtral-mini-tts-3-0'),
    ).toBe(0.013);
  });

  test('preserves the unknown cost for missing text', () => {
    expect(getCloneDollarCost('mistral')).toBe(-1);
  });
});
