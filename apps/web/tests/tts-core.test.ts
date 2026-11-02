import {
  FinishReason,
  type GenerateContentResponse,
  type GoogleGenAI,
} from '@google/genai';
import { describe, expect, it, vi } from 'vitest';

import {
  classifyGeminiAudio,
  GEMINI_FLASH_MODEL,
  GeminiGenerationError,
  generateGeminiAudio,
  getGeminiProviderFailure,
  isAbortError,
} from '@/lib/tts/gemini';
import {
  buildGeminiTtsPrompt,
  resolveGeminiTtsModel,
} from '@/lib/tts/gemini-prompt';

const audioResponse = (
  finishReason: FinishReason | undefined,
  withAudio = true,
  blockReason?: string,
): GenerateContentResponse =>
  ({
    candidates: [
      {
        content: {
          parts: withAudio
            ? [
                {
                  inlineData: {
                    data: 'AAAA',
                    mimeType: 'audio/L16;rate=24000',
                  },
                },
              ]
            : [{ text: 'no audio' }],
        },
        finishReason,
      },
    ],
    ...(blockReason ? { promptFeedback: { blockReason } } : {}),
  }) as unknown as GenerateContentResponse;

describe('buildGeminiTtsPrompt', () => {
  it('labels style and transcript for gpro31', () => {
    expect(
      buildGeminiTtsPrompt({
        model: 'gpro31',
        styleVariant: 'whisper',
        text: 'hello',
      }),
    ).toBe("### DIRECTOR'S NOTES\nStyle: whisper\n\n## TRANSCRIPT\nhello");
  });

  it('uses an inline prefix for non-3.1 gemini models', () => {
    expect(
      buildGeminiTtsPrompt({
        model: 'gpro',
        styleVariant: 'angry',
        text: 'hello',
      }),
    ).toBe('angry: hello');
  });

  it('returns the raw text when no style is given', () => {
    expect(
      buildGeminiTtsPrompt({
        model: 'gpro31',
        text: 'hello',
      }),
    ).toBe('hello');
  });
});

describe('resolveGeminiTtsModel', () => {
  it('returns 2.5 flash for free gpro users', () => {
    expect(resolveGeminiTtsModel({ model: 'gpro', userHasPaid: false })).toBe(
      GEMINI_FLASH_MODEL,
    );
  });

  it('returns 3.1 for gpro31 regardless of tier (free taste of 3.1)', () => {
    expect(resolveGeminiTtsModel({ model: 'gpro31', userHasPaid: false })).toBe(
      'gemini-3.1-flash-tts-preview',
    );
    expect(resolveGeminiTtsModel({ model: 'gpro31', userHasPaid: true })).toBe(
      'gemini-3.1-flash-tts-preview',
    );
  });

  it('returns the pro model for paid gpro', () => {
    expect(resolveGeminiTtsModel({ model: 'gpro', userHasPaid: true })).toBe(
      'gemini-2.5-pro-preview-tts',
    );
  });
});

describe('classifyGeminiAudio', () => {
  it('returns audio data on a successful STOP response', () => {
    const result = classifyGeminiAudio(audioResponse(FinishReason.STOP));
    expect(result.errorCode).toBeNull();
    expect(result.data).toBe('AAAA');
    expect(result.mimeType).toBe('audio/L16;rate=24000');
  });

  it('flags prohibited content', () => {
    const result = classifyGeminiAudio(
      audioResponse(FinishReason.PROHIBITED_CONTENT, false),
    );
    expect(result.errorCode).toBe('PROHIBITED_CONTENT');
    expect(result.isProhibitedContent).toBe(true);
  });

  it('flags prohibited content via promptFeedback blockReason', () => {
    const result = classifyGeminiAudio(
      audioResponse(undefined, false, 'PROHIBITED_CONTENT'),
    );
    expect(result.errorCode).toBe('PROHIBITED_CONTENT');
  });

  it('flags a STOP response with no audio as retryable no-audio', () => {
    const result = classifyGeminiAudio(audioResponse(FinishReason.STOP, false));
    expect(result.errorCode).toBe('NO_AUDIO_DATA');
    expect(result.isNoAudioData).toBe(true);
  });

  it.each([FinishReason.SAFETY, FinishReason.BLOCKLIST, FinishReason.SPII])(
    'classifies %s as a content block',
    (reason) => {
      expect(classifyGeminiAudio(audioResponse(reason, false)).errorCode).toBe(
        'PROHIBITED_CONTENT',
      );
    },
  );

  it('classifies OTHER without audio as a retryable no-audio response', () => {
    expect(
      classifyGeminiAudio(audioResponse(FinishReason.OTHER, false)).errorCode,
    ).toBe('NO_AUDIO_DATA');
  });

  it('flags other non-STOP finish reasons as a generic block', () => {
    const result = classifyGeminiAudio(
      audioResponse(FinishReason.MAX_TOKENS, false),
    );
    expect(result.errorCode).toBe('OTHER_GEMINI_BLOCK');
  });
});

describe('isAbortError', () => {
  it('detects native AbortError', () => {
    const err = new Error('stopped');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('detects SDK-wrapped aborts by message', () => {
    expect(isAbortError(new Error('The request was aborted'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError('boom')).toBe(false);
  });
});

describe('generateGeminiAudio', () => {
  const makeAi = (generateContent: ReturnType<typeof vi.fn>) =>
    ({ models: { generateContent } }) as unknown as GoogleGenAI;

  it('returns the primary response on success', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValue(audioResponse(FinishReason.STOP));
    const ai = makeAi(generateContent);

    const result = await generateGeminiAudio({
      ai,
      primaryModel: 'gemini-2.5-pro-preview-tts',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      config: {},
    });

    expect(result.modelUsed).toBe('gemini-2.5-pro-preview-tts');
    expect(result.primaryError).toBeUndefined();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('falls back to flash and records the primary error', async () => {
    const primaryError = new Error('pro down');
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(primaryError)
      .mockResolvedValueOnce(audioResponse(FinishReason.STOP));
    const ai = makeAi(generateContent);

    const result = await generateGeminiAudio({
      ai,
      primaryModel: 'gemini-2.5-pro-preview-tts',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      config: {},
    });

    expect(result.modelUsed).toBe(GEMINI_FLASH_MODEL);
    expect(result.primaryError).toBe(primaryError);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('does not fall back when the primary model is already flash', async () => {
    const primaryError = new Error('flash down');
    const generateContent = vi.fn().mockRejectedValue(primaryError);
    const ai = makeAi(generateContent);

    await expect(
      generateGeminiAudio({
        ai,
        primaryModel: GEMINI_FLASH_MODEL,
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        config: {},
      }),
    ).rejects.toBe(primaryError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('preserves 3.8 speech metadata and never retries its extended voices on 2.5', async () => {
    const providerError = new Error('3.8 unavailable');
    const generateContent = vi.fn().mockRejectedValue(providerError);
    const contents = [
      {
        role: 'user',
        parts: [{ text: 'Hola', speechMetadata: { style: 'Paciente' } }],
      },
    ];
    const config = {
      speechConfig: { voiceConfig: { voice: 'es-es-tutor-12' } },
    };

    await expect(
      generateGeminiAudio({
        ai: makeAi(generateContent),
        primaryModel: 'gemini-3.8-flash-tts',
        contents,
        config,
      }),
    ).rejects.toBe(providerError);
    expect(generateContent).toHaveBeenCalledExactlyOnceWith({
      model: 'gemini-3.8-flash-tts',
      contents,
      config,
    });
  });

  it('rethrows aborts without attempting the fallback', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const generateContent = vi.fn().mockRejectedValue(abortError);
    const ai = makeAi(generateContent);

    await expect(
      generateGeminiAudio({
        ai,
        primaryModel: 'gemini-2.5-pro-preview-tts',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        config: {},
      }),
    ).rejects.toBe(abortError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('throws GeminiGenerationError carrying both errors when both fail', async () => {
    const proError = new Error('pro down');
    const flashError = new Error('flash down');
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(proError)
      .mockRejectedValueOnce(flashError);
    const ai = makeAi(generateContent);

    const error = await generateGeminiAudio({
      ai,
      primaryModel: 'gemini-2.5-pro-preview-tts',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      config: {},
    }).catch((e) => e);

    expect(error).toBeInstanceOf(GeminiGenerationError);
    expect(error.proError).toBe(proError);
    expect(error.flashError).toBe(flashError);
  });
});

describe('getGeminiProviderFailure', () => {
  it('returns null for non-provider errors', () => {
    expect(
      getGeminiProviderFailure([new Error('boom'), new Error('bang')]),
    ).toBeNull();
  });
});
