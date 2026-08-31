import { FinishReason } from '@google/genai';
import { describe, expect, it } from 'vitest';

import { classifyGeminiTtsResponse } from '@/lib/tts/gemini-response';

describe('classifyGeminiTtsResponse', () => {
  it('classifies a normal audio response as successful', () => {
    expect(
      classifyGeminiTtsResponse({
        finishReason: FinishReason.STOP,
        hasAudio: true,
      }),
    ).toBe('success');
  });

  it.each([
    { finishReason: FinishReason.SAFETY },
    { finishReason: FinishReason.PROHIBITED_CONTENT },
    { finishReason: FinishReason.BLOCKLIST },
    { finishReason: FinishReason.SPII },
    { blockReason: 'SAFETY' },
    { blockReason: 'PROHIBITED_CONTENT' },
    { blockReason: 'BLOCKLIST' },
  ])('classifies $finishReason$blockReason as content blocked', (response) => {
    expect(
      classifyGeminiTtsResponse({
        ...response,
        hasAudio: false,
      }),
    ).toBe('content_blocked');
  });

  it.each([FinishReason.STOP, FinishReason.OTHER])(
    'classifies %s without audio as no audio',
    (finishReason) => {
      expect(classifyGeminiTtsResponse({ finishReason, hasAudio: false })).toBe(
        'no_audio',
      );
    },
  );

  it.each([
    {},
    { finishReason: FinishReason.MAX_TOKENS },
    { blockReason: 'OTHER' },
  ])('classifies an unhandled response as unexpected', (response) => {
    expect(
      classifyGeminiTtsResponse({
        ...response,
        hasAudio: false,
      }),
    ).toBe('unexpected');
  });
});
