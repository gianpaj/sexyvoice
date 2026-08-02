import { describe, expect, it } from 'vitest';

import { calculateGenerateApiDollarAmount } from '@/lib/api/pricing';

describe('external API pricing', () => {
  it('calculates Gemini 2.5 Pro TTS pricing from provider model usage', () => {
    const amount = calculateGenerateApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'gemini-2.5-pro-preview-tts',
      inputChars: 1000,
      promptTokenCount: 11,
      candidatesTokenCount: 12,
    });
    expect(amount).toBe(0.000_251);
  });

  it('calculates Gemini 3.1 Flash TTS pricing from provider model usage', () => {
    const amount = calculateGenerateApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'gemini-3.1-flash-tts-preview',
      inputChars: 1000,
      promptTokenCount: 6,
      candidatesTokenCount: 36,
    });
    expect(amount).toBe(0.000_726);
  });

  it('calculates Gemini API TTS pricing from provider token usage when available', () => {
    const amount = calculateGenerateApiDollarAmount({
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
    const amount = calculateGenerateApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'gemini-2.5-flash-preview-tts',
      inputChars: 1000,
      promptTokenCount: 5,
      candidatesTokenCount: 10,
    });
    expect(amount).toBe(0.000_103);
  });

  it('calculates Orpheus TTS pricing from stored Replicate model usage', () => {
    const amount = calculateGenerateApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'replicate',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      inputChars: 1000,
    });
    expect(amount).toBe(0.015);
  });

  it('calculates xai tts pricing', () => {
    const amount = calculateGenerateApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'xai',
      model: 'xai',
      inputChars: 1000,
    });
    expect(amount).toBe(0.015);
  });

  it('returns zero when no model pricing is configured', () => {
    const amount = calculateGenerateApiDollarAmount({
      sourceType: 'api_tts',
      provider: 'google',
      model: 'unknown-model',
      inputChars: 1000,
    });
    expect(amount).toBe(0);
  });

  it('charges a per-request price for replicate voice cloning', () => {
    const amount = calculateGenerateApiDollarAmount({
      sourceType: 'api_voice_cloning',
      provider: 'replicate',
      model: 'future-model',
    });
    expect(amount).toBe(0.0121);
  });

  it('charges per input character for mistral voice cloning', () => {
    const amount = calculateGenerateApiDollarAmount({
      sourceType: 'api_voice_cloning',
      provider: 'mistral',
      inputChars: 1000,
    });
    expect(amount).toBe(0.016);
  });
});
