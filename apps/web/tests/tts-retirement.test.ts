import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as estimate } from '@/app/api/estimate-credits/route';
import { POST as dashboard } from '@/app/api/generate-voice/route';
import { POST as speech } from '@/app/api/v1/speech/route';
import {
  getVoiceById,
  getVoiceByIdAdmin,
  getVoiceIdByNameAdmin,
  reduceCredits,
  reduceCreditsAdmin,
  reduceCreditsUpTo,
  reduceCreditsUpToAdmin,
} from '@/lib/supabase/queries';
import { isActiveTtsModel } from '@/lib/tts/models';
import {
  mockCountTokens,
  mockRedisGet,
  mockReplicateRun,
  resetMockGoogleGenAIFactory,
  setMockGoogleGenAIFactory,
} from './setup';

function request(path: string, body: object) {
  return new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer sk_live_${'A'.repeat(32)}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}

describe('retired Gemini TTS catalogs', () => {
  const generateContent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: mockCountTokens, generateContent },
    }));
  });

  afterEach(() => resetMockGoogleGenAIFactory());

  it.each(['gpro', 'gpro31'])(
    'rejects the %s alias before voice lookup',
    async (model) => {
      const response = await speech(
        request('/api/v1/speech', {
          input: 'Hello',
          model,
          voice: 'kore',
        }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatchObject({
        param: 'model',
        type: 'invalid_request_error',
      });
      expect(getVoiceIdByNameAdmin).not.toHaveBeenCalled();
      expect(generateContent).not.toHaveBeenCalled();
      expect(reduceCreditsAdmin).not.toHaveBeenCalled();
    },
  );

  for (const model of ['gpro', 'gpro31']) {
    it.each([
      [
        'dashboard',
        dashboard,
        '/api/generate-voice',
        { text: 'Hello', stream: true },
      ],
      ['estimate', estimate, '/api/estimate-credits', { text: 'Hello' }],
      ['external API', speech, '/api/v1/speech', { input: 'Hello' }],
    ] as const)(
      `rejects a ${model} UUID in %s before cache, providers, or charges`,
      async (_label, post, path, body) => {
        const voice = {
          id: 'retired-voice-id',
          language: 'multiple',
          model,
          name: 'kore',
        };
        if (path === '/api/v1/speech') {
          vi.mocked(getVoiceByIdAdmin).mockResolvedValueOnce(voice);
        } else {
          vi.mocked(getVoiceById).mockResolvedValueOnce(voice);
        }
        expect(isActiveTtsModel(model)).toBe(false);
        const response = await post(
          request(path, { ...body, voiceId: voice.id }),
        );
        expect(response.status).toBe(404);
        const result = await response.json();
        if (path === '/api/v1/speech') {
          expect(result.error).toMatchObject({
            code: 'voice_not_found',
            param: 'voiceId',
          });
        } else {
          expect(result.error).toBe('Voice not found');
        }
        expect(mockRedisGet).not.toHaveBeenCalled();
        expect(mockCountTokens).not.toHaveBeenCalled();
        expect(generateContent).not.toHaveBeenCalled();
        expect(mockReplicateRun).not.toHaveBeenCalled();
        for (const debit of [
          reduceCredits,
          reduceCreditsAdmin,
          reduceCreditsUpTo,
          reduceCreditsUpToAdmin,
        ]) {
          expect(debit).not.toHaveBeenCalled();
        }
      },
    );
  }
});
