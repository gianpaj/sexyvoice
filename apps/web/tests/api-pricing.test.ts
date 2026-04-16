import { describe, expect, it } from 'vitest';

import { calculateExternalApiDollarAmount } from '@/lib/api/pricing';

describe('external API pricing', () => {
  it('calculates gpro tts pricing', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'gpro',
      inputChars: 1000,
    });
    expect(amount).toBe(0.02);
  });

  it('calculates g31 tts pricing', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'g31',
      inputChars: 1000,
    });
    expect(amount).toBe(0.02);
  });

  it('calculates orpheus tts pricing', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'replicate',
      model: 'orpheus',
      inputChars: 1000,
    });
    expect(amount).toBe(0.015);
  });

  it('returns zero when no model pricing is configured', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'unknown-model',
      inputChars: 1000,
    });
    expect(amount).toBe(0);
  });

  it('supports api_voice_cloning pricing key (currently zero)', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_voice_cloning',
      provider: 'replicate',
      model: 'future-model',
    });
    expect(amount).toBe(0);
  });
});
