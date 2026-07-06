import { describe, expect, it } from 'vitest';

import { normalizeXaiTtsSpeed } from '@/lib/tts/xai';

describe('normalizeXaiTtsSpeed', () => {
  it('returns undefined for missing or invalid values', () => {
    expect(normalizeXaiTtsSpeed(undefined)).toBeUndefined();
    expect(normalizeXaiTtsSpeed(Number.NaN)).toBeUndefined();
    // biome-ignore lint/suspicious/noExplicitAny: exercising a non-number input
    expect(normalizeXaiTtsSpeed('1.2' as any)).toBeUndefined();
  });

  it('passes through values within the supported range', () => {
    expect(normalizeXaiTtsSpeed(1)).toBe(1);
    expect(normalizeXaiTtsSpeed(0.7)).toBe(0.7);
    expect(normalizeXaiTtsSpeed(1.5)).toBe(1.5);
    expect(normalizeXaiTtsSpeed(1.2)).toBe(1.2);
  });

  it('clamps values outside the 0.7–1.5 range', () => {
    expect(normalizeXaiTtsSpeed(0.1)).toBe(0.7);
    expect(normalizeXaiTtsSpeed(0)).toBe(0.7);
    expect(normalizeXaiTtsSpeed(3)).toBe(1.5);
    expect(normalizeXaiTtsSpeed(-5)).toBe(0.7);
  });
});
