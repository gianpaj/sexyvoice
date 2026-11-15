import { describe, expect, it } from 'vitest';

import { speechProviderCost } from '@/lib/tts/provider-cost';

describe('speechProviderCost', () => {
  it('prices retired Gemini models from token usage for history', () => {
    expect(
      speechProviderCost({
        candidatesTokenCount: 12,
        inputChars: 1000,
        model: 'gemini-2.5-pro-preview-tts',
        promptTokenCount: 11,
      }),
    ).toBe(0.000_251);
    expect(
      speechProviderCost({
        candidatesTokenCount: 36,
        inputChars: 1000,
        model: 'gemini-3.1-flash-tts-preview',
        promptTokenCount: 6,
      }),
    ).toBe(0.000_726);
    expect(
      speechProviderCost({
        candidatesTokenCount: 10,
        inputChars: 1000,
        model: 'gemini-2.5-flash-preview-tts',
        promptTokenCount: 5,
      }),
    ).toBe(0.000_103);
  });

  it('prices Orpheus per input character', () => {
    expect(
      speechProviderCost({
        inputChars: 1000,
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      }),
    ).toBe(0.015);
  });

  it('prices Grok at $4.20 per million characters', () => {
    expect(speechProviderCost({ inputChars: 1000, model: 'xai' })).toBe(0.0042);
  });

  it('returns zero when the model has no price', () => {
    expect(
      speechProviderCost({ inputChars: 1000, model: 'unknown-model' }),
    ).toBe(0);
  });
});
