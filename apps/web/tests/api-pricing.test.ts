import { describe, expect, it } from 'vitest';

import { calculateGenerateApiDollarAmount } from '@/lib/api/pricing';

describe('external API pricing', () => {
  it('calculates Gemini 2.5 Pro TTS pricing from provider model usage', () => {
    const amount = calculateGenerateApiDollarAmount({
      candidatesTokenCount: 12,
      inputChars: 1000,
      model: 'gemini-2.5-pro-preview-tts',
      promptTokenCount: 11,
      provider: 'google',
      sourceType: 'api_tts',
    });
    expect(amount).toBe(0.000_251);
  });

  it('calculates Gemini 3.1 Flash TTS pricing from provider model usage', () => {
    const amount = calculateGenerateApiDollarAmount({
      candidatesTokenCount: 36,
      inputChars: 1000,
      model: 'gemini-3.1-flash-tts-preview',
      promptTokenCount: 6,
      provider: 'google',
      sourceType: 'api_tts',
    });
    expect(amount).toBe(0.000_726);
  });

  it('calculates Gemini API TTS pricing from provider token usage when available', () => {
    const amount = calculateGenerateApiDollarAmount({
      candidatesTokenCount: 36,
      inputChars: 1000,
      model: 'gemini-3.1-flash-tts-preview',
      promptTokenCount: 6,
      provider: 'google',
      sourceType: 'api_tts',
    });
    expect(amount).toBe(0.000_726);
  });

  it('calculates Gemini 2.5 Flash fallback API TTS pricing from provider token usage', () => {
    const amount = calculateGenerateApiDollarAmount({
      candidatesTokenCount: 10,
      inputChars: 1000,
      model: 'gemini-2.5-flash-preview-tts',
      promptTokenCount: 5,
      provider: 'google',
      sourceType: 'api_tts',
    });
    expect(amount).toBe(0.000_103);
  });

  it('calculates Orpheus TTS pricing from stored Replicate model usage', () => {
    const amount = calculateGenerateApiDollarAmount({
      inputChars: 1000,
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      provider: 'replicate',
      sourceType: 'api_tts',
    });
    expect(amount).toBe(0.015);
  });

  it('calculates xai tts pricing', () => {
    const amount = calculateGenerateApiDollarAmount({
      inputChars: 1000,
      model: 'xai',
      provider: 'xai',
      sourceType: 'api_tts',
    });
    expect(amount).toBe(0.015);
  });

  it('returns zero when no model pricing is configured', () => {
    const amount = calculateGenerateApiDollarAmount({
      inputChars: 1000,
      model: 'unknown-model',
      provider: 'google',
      sourceType: 'api_tts',
    });
    expect(amount).toBe(0);
  });

  it('supports api_voice_cloning pricing key (currently zero)', () => {
    const amount = calculateGenerateApiDollarAmount({
      model: 'future-model',
      provider: 'replicate',
      sourceType: 'api_voice_cloning',
    });
    expect(amount).toBe(0);
  });
});
