import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as estimate } from '@/app/api/estimate-credits/route';
import { POST as dashboard } from '@/app/api/generate-voice/route';
import { POST as speech } from '@/app/api/v1/speech/route';
import { calculateGenerateApiDollarAmount } from '@/lib/api/pricing';
import { convertToWav } from '@/lib/audio';
import {
  getVoiceById,
  getVoiceByIdAdmin,
  insertUsageEvent,
  restoreCredits,
} from '@/lib/supabase/queries';
import {
  buildGeminiTtsContents,
  buildGeminiTtsPrompt,
  buildGeminiVoiceConfig,
  resolveGeminiTtsModel,
} from '@/lib/tts/gemini-prompt';
import { resolveUsageCost } from '@/lib/usage-costs';
import { estimateCredits, getTtsProvider } from '@/lib/utils';
import {
  mockRedisGet,
  mockUploadFileToR2,
  resetMockGoogleGenAIFactory,
  setMockGoogleGenAIFactory,
} from './setup';

const voice = {
  id: 'voice-38',
  language: 'es-ES',
  model: 'gpro38',
  name: 'es-es-tutor-12',
};
const wav = Buffer.from(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
  'base64',
);
const providerResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            inlineData: { data: wav.toString('base64'), mimeType: 'audio/wav' },
          },
        ],
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: {
    candidatesTokenCount: 100,
    promptTokenCount: 20,
    totalTokenCount: 120,
  },
};
function request(url: string, body: object) {
  return new Request(`http://localhost${url}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer sk_live_${'A'.repeat(32)}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}

describe('Gemini 3.8 integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetMockGoogleGenAIFactory();
  });

  it('keeps direction out of the transcript and preserves the extended voice ID', () => {
    const text = 'Vamos paso a paso.';
    expect(
      buildGeminiTtsPrompt({ model: 'gpro38', styleVariant: 'Paciente', text }),
    ).toBe(text);
    expect(
      buildGeminiTtsContents({
        model: 'gpro38',
        styleVariant: 'Paciente',
        text,
      }),
    ).toEqual([
      {
        parts: [{ speechMetadata: { style: 'Paciente' }, text }],
        role: 'user',
      },
    ]);
    expect(buildGeminiVoiceConfig(voice.name, 'gpro38')).toEqual({
      voice: voice.name,
    });
    expect(buildGeminiVoiceConfig('kore', 'gpro38')).toEqual({ voice: 'Kore' });
    expect(resolveGeminiTtsModel({ model: 'gpro38', userHasPaid: false })).toBe(
      'gemini-3.8-flash-tts',
    );
    expect(getTtsProvider('gpro38')).toBe('gemini');
    expect(estimateCredits(text, voice.name, 'gpro38', false)).toBe(
      estimateCredits(text, voice.name, 'gpro', false),
    );
  });

  it.each(['tts', 'api_tts'] as const)(
    'prices %s across the promotional boundary',
    (sourceType) => {
      const input = {
        candidatesTokenCount: 1_000_000,
        model: 'gemini-3.8-flash-tts',
        promptTokenCount: 1_000_000,
        provider: 'google' as const,
        sourceType,
      };
      expect(
        calculateGenerateApiDollarAmount({
          ...input,
          occurredAt: '2026-12-31T23:59:59Z',
        }),
      ).toBe(9.5);
      expect(
        calculateGenerateApiDollarAmount({
          ...input,
          occurredAt: '2027-01-01T00:00:00Z',
        }),
      ).toBe(19);
    },
  );

  it('uses the event date when recovering historical provider costs', () => {
    vi.setSystemTime(new Date('2027-02-01'));
    expect(
      resolveUsageCost({
        dollar_amount: null,
        duration_seconds: null,
        input_chars: null,
        metadata: { candidatesTokenCount: 100, promptTokenCount: 20 },
        model: 'gemini-3.8-flash-tts',
        occurred_at: '2026-09-23T00:00:00Z',
        source_type: 'tts',
      }),
    ).toEqual({ amount: 0.000_91, basis: 'estimated' });
  });

  it('preserves provider WAV headers and wraps raw PCM once', () => {
    expect(convertToWav(wav.toString('base64'), 'audio/wav')).toEqual(wav);
    const pcm = Buffer.alloc(48);
    const wrapped = convertToWav(
      pcm.toString('base64'),
      'audio/L16;rate=24000',
    );
    expect(wrapped.length).toBe(92);
    expect(wrapped.readUInt32LE(24)).toBe(24_000);
    expect(wrapped.subarray(44)).toEqual(pcm);
  });

  it('records the real model, provider tokens and cost through the external API', async () => {
    vi.mocked(getVoiceByIdAdmin).mockResolvedValueOnce(voice);
    const generateContent = vi.fn().mockResolvedValue(providerResponse);
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));
    const response = await speech(
      request('/api/v1/speech', {
        input: 'Hola.',
        style: 'Paciente',
        voiceId: voice.id,
      }),
    );
    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          speechConfig: { voiceConfig: { voice: voice.name } },
        }),
        contents: [
          {
            parts: [{ speechMetadata: { style: 'Paciente' }, text: 'Hola.' }],
            role: 'user',
          },
        ],
        model: 'gemini-3.8-flash-tts',
      }),
    );
    expect(insertUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        dollarAmount: 0.000_91,
        metadata: expect.objectContaining({
          candidatesTokenCount: '100',
          promptTokenCount: '20',
        }),
        model: 'gemini-3.8-flash-tts',
      }),
    );
    expect(mockUploadFileToR2.mock.calls[0][1]).toEqual(wav);
  });

  it('does not fall back to an incompatible model and refunds on failure', async () => {
    vi.mocked(getVoiceByIdAdmin).mockResolvedValueOnce(voice);
    const generateContent = vi
      .fn()
      .mockRejectedValue(new Error('Provider unavailable'));
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));
    const response = await speech(
      request('/api/v1/speech', { input: 'Hola.', voiceId: voice.id }),
    );
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(restoreCredits).toHaveBeenCalled();
    expect(insertUsageEvent).not.toHaveBeenCalled();
  });

  it('uses structured style and records costs in dashboard generation', async () => {
    vi.mocked(getVoiceById).mockResolvedValueOnce(voice);
    mockRedisGet.mockResolvedValueOnce(null);
    const generateContent = vi.fn().mockResolvedValue(providerResponse);
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));
    const response = await dashboard(
      request('/api/generate-voice', {
        styleVariant: 'Paciente',
        text: 'Hola.',
        voiceId: voice.id,
      }),
    );
    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: [
          {
            parts: [{ speechMetadata: { style: 'Paciente' }, text: 'Hola.' }],
            role: 'user',
          },
        ],
        model: 'gemini-3.8-flash-tts',
      }),
    );
    await vi.waitFor(() =>
      expect(insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          dollarAmount: 0.000_91,
          model: 'gemini-3.8-flash-tts',
        }),
      ),
    );
  });
  it('counts structured style while estimating only the spoken transcript duration', async () => {
    vi.mocked(getVoiceById).mockResolvedValueOnce(voice);
    const countTokens = vi.fn().mockResolvedValue({ totalTokens: 20 });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens, generateContent: vi.fn() },
    }));
    const response = await estimate(
      request('/api/estimate-credits', {
        styleVariant: 'Paciente',
        text: 'Hola.',
        voiceId: voice.id,
      }),
    );
    expect(response.status).toBe(200);
    expect(countTokens).toHaveBeenCalledWith({
      contents: [
        {
          parts: [{ speechMetadata: { style: 'Paciente' }, text: 'Hola.' }],
          role: 'user',
        },
      ],
      model: 'gemini-3.8-flash-tts',
    });
    expect((await response.json()).tokens).toBe(29);
  });

  it('keeps different delivery styles in separate dashboard cache entries', async () => {
    const generateContent = vi.fn().mockResolvedValue(providerResponse);
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));
    for (const styleVariant of ['Paciente', 'Alegre']) {
      vi.mocked(getVoiceById).mockResolvedValueOnce(voice);
      mockRedisGet.mockResolvedValueOnce(null);
      const response = await dashboard(
        request('/api/generate-voice', {
          styleVariant,
          text: 'Hola.',
          voiceId: voice.id,
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(mockRedisGet.mock.calls[0][0]).not.toEqual(
      mockRedisGet.mock.calls[1][0],
    );
  });
});
