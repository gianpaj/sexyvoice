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

  it('calculates gpro31 tts pricing', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'gpro31',
      inputChars: 1000,
    });
    expect(amount).toBe(0.02);
  });

  it('calculates Gemini API TTS pricing from provider token usage when available', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'gemini-3.1-flash-tts-preview',
      inputChars: 1000,
      promptTokenCount: 6,
      candidatesTokenCount: 36,
    });
    expect(amount).toBe(0.000_726);
  });

  it('calculates Gemini 2.5 Flash fallback API TTS pricing from provider token usage', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'gemini-2.5-flash-preview-tts',
      inputChars: 1000,
      promptTokenCount: 5,
      candidatesTokenCount: 10,
    });
    expect(amount).toBe(0.000_103);
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

  it('calculates xai tts pricing', () => {
    const amount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'xai',
      model: 'xai',
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
