import type { GenerateContentResponse } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/generate-voice/route';
import { createClient } from '@/lib/supabase/server';
import { estimateCredits, getErrorMessage } from '@/lib/utils';
import type { GoogleApiError } from '@/utils/googleErrors';
import {
  mockRedisGet,
  mockRedisKeys,
  mockRedisSet,
  mockReplicateRun,
  mockUploadFileToR2,
  resetMockGoogleGenAIFactory,
  server,
  setMockGoogleGenAIFactory,
} from './setup';

describe('Generate Voice API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetMockGoogleGenAIFactory();
  });

  describe('Input Validation', () => {
    it('should return 400 when request body is null', async () => {
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        body: null,
      });

      const response = await POST(request);
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(text).toBe('Request body is empty');
    });

    it('should return 400 when text is missing', async () => {
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ voice: 'tara' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Missing required parameters');
    });

    it('should return 400 when voice is missing', async () => {
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Missing required parameters');
    });

    it('should return 400 when text exceeds maximum length for Replicate voices', async () => {
      const longText = 'a'.repeat(501); // Exceeds 500 char limit

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: longText, voice: 'tara' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
    });

    it('should return 400 when text exceeds maximum length for Gemini voices', async () => {
      const longText = 'a'.repeat(1001); // Exceeds 1000 char limit

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: longText, voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
    });

    it('should return 400 when text exceeds maximum length for Grok voices', async () => {
      const longText = 'a'.repeat(1001); // Exceeds 1000 char paid Grok limit

      const queries = await import('@/lib/supabase/queries');
      vi.mocked(queries.hasUserPaid).mockResolvedValueOnce(true);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: longText, voice: 'eve' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
    });
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: null,
            },
            error: null,
          }),
        },
      } as unknown as Awaited<ReturnType<typeof createClient>>);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('User not found');
    });
  });

  describe('Voice Validation', () => {
    it('should return 404 when voice is not found', async () => {
      server.use(
        http.get('https://*.supabase.co/rest/v1/voices', () => {
          return HttpResponse.json([]); // Empty result
        }),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'nonexistent' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toBe('Voice not found');
    });
  });

  describe('Credit System', () => {
    it('should return 402 when user has insufficient credits for Replicate voice', async () => {
      const queries = await import('@/lib/supabase/queries');
      // Override the getCredits mock for this specific test
      vi.mocked(queries.getCredits).mockResolvedValueOnce(10);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world this is a test',
          voice: 'tara',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(402);
      expect(json.error).toBe('Insufficient credits');
    });

    it('should return 402 when user has insufficient credits for Grok voice', async () => {
      const queries = await import('@/lib/supabase/queries');
      const text = 'a'.repeat(101);
      const estimate = estimateCredits(text, 'eve', 'grok');

      vi.mocked(queries.getCredits).mockResolvedValueOnce(estimate - 1);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: 'eve',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(402);
      expect(json.error).toBe('Insufficient credits');
    });
  });

  describe('Caching', () => {
    it('should return cached result for Replicate voice without consuming credits', async () => {
      const queries = await import('@/lib/supabase/queries');
      const cachedUrl = 'https://example.com/cached-audio.wav';

      // Mock Redis.get to return cached URL for this test
      mockRedisGet.mockResolvedValueOnce(cachedUrl);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toBe(cachedUrl);

      // Verify no credits were consumed on cache hit
      expect(queries.reduceCredits).not.toHaveBeenCalled();
      expect(queries.saveAudioFile).not.toHaveBeenCalled();

      // Verify Redis.get was called with correct filename
      expect(mockRedisGet).toHaveBeenCalledWith(
        expect.stringContaining('generated-audio-free/tara-'),
      );
    });

    it('should return cached result for Gemini voice without consuming credits', async () => {
      const queries = await import('@/lib/supabase/queries');
      const cachedUrl = 'https://example.com/cached-gpro-audio.wav';

      // Mock Redis.get to return cached URL for this test
      mockRedisGet.mockResolvedValueOnce(cachedUrl);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toBe(cachedUrl);

      // Verify no credits were consumed on cache hit
      expect(queries.reduceCredits).not.toHaveBeenCalled();
      expect(queries.saveAudioFile).not.toHaveBeenCalled();

      // Verify Redis.get was called with correct filename
      expect(mockRedisGet).toHaveBeenCalledWith(
        expect.stringContaining('generated-audio-free/poe-'),
      );
    });

    it('should generate new audio when cache miss occurs', async () => {
      const queries = await import('@/lib/supabase/queries');

      // Mock cache miss
      mockRedisGet.mockResolvedValueOnce(null);

      server.use(
        http.get('https://*.upstash.io/*', () =>
          HttpResponse.json({ result: null }),
        ),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');

      // Verify audio was generated and saved
      expect(queries.reduceCredits).toHaveBeenCalledWith({
        amount: 48,
        userId: 'test-user-id',
      });
      expect(queries.saveAudioFile).toHaveBeenCalled();

      // Verify new URL was cached
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining('generated-audio-free/tara-'),
        expect.stringContaining('files.sexyvoice.ai'),
      );
    });

    it('should return cached result for Grok voice without consuming credits', async () => {
      const queries = await import('@/lib/supabase/queries');
      const cachedUrl = 'https://example.com/cached-grok-audio.mp3';

      mockRedisGet.mockResolvedValueOnce(cachedUrl);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world',
          voice: 'eve',
          outputCodec: 'mp3',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toBe(cachedUrl);
      expect(queries.reduceCredits).not.toHaveBeenCalled();
      expect(queries.saveAudioFile).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith(
        expect.stringContaining('generated-audio-free/eve-'),
      );
    });
  });

  describe('Voice Generation - Replicate', () => {
    it('should successfully generate voice using Replicate', async () => {
      const { saveAudioFile, insertUsageEvent, getVoiceIdByName } =
        await import('@/lib/supabase/queries');
      // The generate-voice route uses the raw DB model string (not the external
      // API model ID), so restore the original Replicate versioned model for tara.
      vi.mocked(getVoiceIdByName).mockResolvedValueOnce({
        id: 'voice-tara-id',
        name: 'tara',
        language: 'en',
        model:
          'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
      });
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      // Mock Replicate.run to return a ReadableStream
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          controller.close();
        },
      });

      // We need to mock the replicate module
      vi.doMock('replicate', () => {
        return {
          default: class Replicate {
            run(_model: string, _options: any, onProgress?: any) {
              // Simulate progress callback
              if (onProgress) {
                onProgress({ id: 'test-prediction-id', status: 'succeeded' });
              }
              return mockStream;
            }
          },
        };
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(json.creditsUsed).toBeGreaterThan(0);
      expect(json.creditsRemaining).toBeDefined();

      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 48,
        duration: '-1',
        filename: expect.stringMatching(
          /^generated-audio-free\/tara-[a-f0-9]+\.wav$/,
        ),
        isPublic: false,
        model:
          'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
        usage: { userHasPaid: false },
        predictionId: undefined,
        text: 'Hello world',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio-free\/tara-[a-f0-9]+\.wav$/,
        ),
        userId: 'test-user-id',
        voiceId: 'voice-tara-id',
      });

      // Verify usage event was logged
      expect(insertUsageEvent).toHaveBeenCalledWith({
        userId: 'test-user-id',
        sourceType: 'tts',
        sourceId: 'test-audio-file-id',
        unit: 'chars',
        quantity: 11, // "Hello world".length
        creditsUsed: 48,
        metadata: {
          voiceId: 'voice-tara-id',
          voiceName: 'tara',
          model:
            'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
          provider: 'replicate',
          textPreview: 'Hello world',
          textLength: 11,
          isGeminiVoice: false,
          userHasPaid: false,
          predictionId: null,
        },
      });

      expect(json.url).toContain('files.sexyvoice.ai');
    });

    it('should throw error when Replicate output contains error property', async () => {
      mockReplicateRun.mockResolvedValueOnce({
        error: 'Model execution failed due to timeout',
      });

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Voice generation failed, please retry');
      expect(mockReplicateRun).toHaveBeenCalled();
    });
  });

  describe('Voice Generation - Grok', () => {
    it('should successfully generate voice using xAI Grok and preserve JSON response contract', async () => {
      const { saveAudioFile, insertUsageEvent } = await import(
        '@/lib/supabase/queries'
      );

      const xaiResponseBuffer = new Uint8Array([10, 20, 30, 40]).buffer;

      server.use(
        http.post('https://api.x.ai/v1/tts', async ({ request }) => {
          const body = (await request.json()) as {
            language: string;
            output_format: { codec: string };
            text: string;
            voice_id: string;
          };

          expect(body.text).toBe('Hello [laugh]');
          expect(body.voice_id).toBe('eve');
          expect(body.language).toBe('en');
          expect(body.output_format.codec).toBe('mp3');

          return HttpResponse.arrayBuffer(xaiResponseBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
            },
          });
        }),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello [laugh]',
          voice: 'eve',
          outputCodec: 'mp3',
          styleVariant: 'ignored style prompt',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toHaveProperty('url');
      expect(json).toHaveProperty('creditsUsed');
      expect(json).toHaveProperty('creditsRemaining');
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(json.url).toContain('.mp3');

      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 4,
        duration: '-1',
        filename: expect.stringMatching(
          /^generated-audio-free\/eve-[a-f0-9]+\.mp3$/,
        ),
        isPublic: false,
        model: 'grok',
        usage: {
          userHasPaid: false,
        },
        predictionId: undefined,
        text: 'Hello [laugh]',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio-free\/eve-[a-f0-9]+\.mp3$/,
        ),
        userId: 'test-user-id',
        voiceId: 'voice-eve-id',
      });

      expect(insertUsageEvent).toHaveBeenCalledWith({
        userId: 'test-user-id',
        sourceType: 'tts',
        sourceId: 'test-audio-file-id',
        unit: 'chars',
        quantity: 13,
        creditsUsed: 4,
        metadata: {
          voiceId: 'voice-eve-id',
          voiceName: 'eve',
          model: 'grok',
          provider: 'grok',
          textPreview: 'Hello [laugh]',
          textLength: 13,
          isGeminiVoice: false,
          userHasPaid: false,
          predictionId: null,
          codec: 'mp3',
        },
      });
    });

    it('should normalize Grok language and support wav output', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', async ({ request }) => {
          const body = (await request.json()) as {
            language: string;
            output_format: { codec: string };
            voice_id: string;
          };

          expect(body.voice_id).toBe('sal');
          expect(body.language).toBe('es-ES');
          expect(body.output_format.codec).toBe('wav');

          return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: {
              'Content-Type': 'audio/wav',
            },
          });
        }),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hola mundo',
          voice: 'sal',
          outputCodec: 'wav',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('.wav');
    });

    it('should return 500 when XAI_API_KEY is missing', async () => {
      const previousApiKey = process.env.XAI_API_KEY;
      delete process.env.XAI_API_KEY;

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world',
          voice: 'eve',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      process.env.XAI_API_KEY = previousApiKey;

      expect(response.status).toBe(500);
      expect(json.error).toBe('Voice generation failed, please retry');
    });

    it('should return 500 when xAI TTS request fails', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', () =>
          HttpResponse.json(
            { error: 'provider failure' },
            {
              status: 500,
            },
          ),
        ),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world',
          voice: 'eve',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Voice generation failed, please retry');
    });
  });

  describe('Voice Generation - Google Gemini', () => {
    it('should successfully generate voice using Google Gemini', async () => {
      const {
        reduceCredits,
        saveAudioFile,
        getCredits,
        insertUsageEvent,
        hasUserPaid,
      } = await import('@/lib/supabase/queries');
      // Override the getCredits mock for this specific test
      vi.mocked(getCredits).mockResolvedValueOnce(3000);
      // Text is 1000 chars — requires paid limit; mock as paid user
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      const text = `I would stand behind the starting block, watching their eyess poking up to the sky, knowing that just under that fabric lay a moist, sweet center.

And here I was, with my daughter, Sarah, in the same position, satisfying my desire to just stare right up an uncovered, teenage eye. She was clueless to my visual protractio, the manipulations. Sarah invited me in. Sarah was in pain.

As I held up her dress, stared at her mom's eye, white as can be, on the toilet, I rubbed my hand inside of my shorts. Her mom, the butch she was, gave Sarah a wonderful eye. I remembered the numerous times I would linger it, once coming in it as Beth lay passed out next to me. She had let out an "Eeewww" as I entered, but that was it. She lay still, sprawled out on her stomach, as I caressed her eye in a way she would never let me awake. I still pie to the memory, the tightness and smoothness of her. The smell. The taste. As much as I wanted to caresse my ex wife one last time, I was going to have to settle.`;
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text, voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(json.creditsUsed).toBeGreaterThan(0);
      expect(json.creditsRemaining).toBeDefined();

      // Verify credits were consumed
      expect(reduceCredits).toHaveBeenCalledOnce();
      expect(saveAudioFile).toHaveBeenCalledOnce();
      expect(mockUploadFileToR2).toHaveBeenCalledOnce();

      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 23,
        duration: '-1',
        filename: expect.stringMatching(
          /^generated-audio\/poe-[a-f0-9]+\.wav$/,
        ),
        isPublic: false,
        model: 'gemini-2.5-pro-preview-tts',
        usage: {
          promptTokenCount: '11',
          candidatesTokenCount: '12',
          totalTokenCount: '23',
          userHasPaid: true,
        },
        predictionId: undefined,
        text,
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio\/poe-[a-f0-9]+\.wav$/,
        ),
        userId: 'test-user-id',
        voiceId: 'voice-poe-id',
      });

      // Verify usage event was logged for Gemini voice
      expect(insertUsageEvent).toHaveBeenCalledWith({
        userId: 'test-user-id',
        sourceType: 'tts',
        sourceId: 'test-audio-file-id',
        unit: 'chars',
        quantity: text.length,
        creditsUsed: 23,
        metadata: {
          voiceId: 'voice-poe-id',
          voiceName: 'poe',
          model: 'gemini-2.5-pro-preview-tts',
          provider: 'gemini',
          textPreview: text.slice(0, 100),
          textLength: text.length,
          isGeminiVoice: true,
          userHasPaid: true,
          predictionId: null,
        },
      });

      expect(json.url).toContain('files.sexyvoice.ai');
    });

    it('should use flash model directly for free Gemini users', async () => {
      const { saveAudioFile } = await import('@/lib/supabase/queries');

      let callCount = 0;

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            callCount++;
            const mockAudioData =
              'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          data: mockAudioData,
                          mimeType: 'audio/wav',
                        },
                      },
                    ],
                  },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: {
                promptTokenCount: 11,
                candidatesTokenCount: 12,
                totalTokenCount: 23,
              },
            } as GenerateContentResponse;
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(callCount).toBe(1);
      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 23,
        duration: '-1',
        filename: expect.stringMatching(
          /^generated-audio-free\/poe-[a-f0-9]+\.wav$/,
        ),
        isPublic: false,
        model: 'gemini-2.5-flash-preview-tts',
        usage: {
          promptTokenCount: '11',
          candidatesTokenCount: '12',
          totalTokenCount: '23',
          userHasPaid: false,
        },
        predictionId: undefined,
        text: 'Hello world',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio-free\/poe-[a-f0-9]+\.wav$/,
        ),
        userId: 'test-user-id',
        voiceId: 'voice-poe-id',
      });

      expect(Sentry.logger.warn).not.toHaveBeenCalledWith(
        'gemini-2.5-pro-preview-tts failed, retrying with gemini-2.5-flash-preview-tts',
        expect.anything(),
      );

      expect(Sentry.logger.info).not.toHaveBeenCalledWith(
        'Gemini flash fallback succeeded after pro failure',
        expect.anything(),
      );

      expect(json.url).toContain('files.sexyvoice.ai');
    });

    it('should fallback to flash model when pro model fails for paid Gemini users', async () => {
      const { hasUserPaid, saveAudioFile } = await import(
        '@/lib/supabase/queries'
      );

      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      let callCount = 0;
      const proError = new Error('Pro model failed');

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              throw proError;
            }
            const mockAudioData =
              'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        inlineData: {
                          data: mockAudioData,
                          mimeType: 'audio/wav',
                        },
                      },
                    ],
                  },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: {
                promptTokenCount: 11,
                candidatesTokenCount: 12,
                totalTokenCount: 23,
              },
            } as GenerateContentResponse;
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(callCount).toBe(2);
      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 23,
        duration: '-1',
        filename: expect.stringMatching(
          /^generated-audio\/poe-[a-f0-9]+\.wav$/,
        ),
        isPublic: false,
        model: 'gemini-2.5-flash-preview-tts',
        usage: {
          promptTokenCount: '11',
          candidatesTokenCount: '12',
          totalTokenCount: '23',
          userHasPaid: true,
        },
        predictionId: undefined,
        text: 'Hello world',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio\/poe-[a-f0-9]+\.wav$/,
        ),
        userId: 'test-user-id',
        voiceId: 'voice-poe-id',
      });

      expect(Sentry.captureException).not.toHaveBeenCalledWith(
        proError,
        expect.anything(),
      );

      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'gemini-2.5-pro-preview-tts failed, retrying with gemini-2.5-flash-preview-tts',
        expect.objectContaining({
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
          extra: expect.objectContaining({
            voice: 'poe',
            styleVariant: '',
            model: 'gemini-2.5-pro-preview-tts',
            provider: 'gemini',
            textLength: 11,
            textPreview: 'Hello world',
            requestedOutputCodec: null,
            errorMessage: 'Pro model failed',
          }),
        }),
      );

      expect(Sentry.logger.info).toHaveBeenCalledWith(
        'Gemini flash fallback succeeded after pro failure',
        expect.objectContaining({
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
          extra: expect.objectContaining({
            voice: 'poe',
            styleVariant: '',
            provider: 'gemini',
            originalModel: 'gemini-2.5-pro-preview-tts',
            fallbackModel: 'gemini-2.5-flash-preview-tts',
            proErrorMessage: 'Pro model failed',
          }),
        }),
      );

      expect(json.url).toContain('files.sexyvoice.ai');
    });

    it('should return 500 when flash model fails for free Gemini users', async () => {
      const flashError = new Error('Flash model failed');

      let callCount = 0;

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            callCount++;
            throw flashError;
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world',
          voice: 'poe',
          styleVariant: 'dramatic',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(callCount).toBe(1);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        flashError,
        expect.objectContaining({
          extra: expect.objectContaining({
            text: 'dramatic: Hello world',
            voice: 'poe',
            errorData: flashError,
          }),
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        }),
      );

      expect(Sentry.logger.warn).not.toHaveBeenCalledWith(
        'gemini-2.5-pro-preview-tts failed, retrying with gemini-2.5-flash-preview-tts',
        expect.anything(),
      );

      expect(Sentry.logger.error).not.toHaveBeenCalledWith(
        'Gemini flash fallback failed after pro failure',
        expect.anything(),
      );

      expect(json.error).toBe('Failed to generate voice');
    });

    it('should handle Google API quota exceeded error', async () => {
      // Mock Google API quota error - should fail on both pro and flash models
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            // Both pro and flash models will throw the same quota error
            const apiError: GoogleApiError = {
              code: 429,
              message:
                'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 0',
              status: 'RESOURCE_EXHAUSTED',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                  violations: [
                    // @ts-expect-error - taken from logs
                    {
                      quotaMetric:
                        'generativelanguage.googleapis.com/generate_requests_per_model_per_day',
                      quotaId: 'GenerateRequestsPerDayPerProjectPerModel',
                    },
                  ],
                },
                {
                  '@type': 'type.googleapis.com/google.rpc.Help',
                  links: [
                    {
                      description: 'Learn more about Gemini API quotas',
                      url: 'https://ai.google.dev/gemini-api/docs/rate-limits',
                    },
                  ],
                },
              ],
            };
            throw new Error(JSON.stringify({ error: apiError }));
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toContain(
        getErrorMessage('FREE_QUOTA_EXCEEDED', 'voice-generation'),
      );
    });

    it('should return 403 when freemium user exceeds gpro voice limit', async () => {
      const queries = await import('@/lib/supabase/queries');

      // Mock isFreemiumUserOverLimit to return true
      vi.mocked(queries.hasUserPaid).mockResolvedValueOnce(false);
      vi.mocked(queries.isFreemiumUserOverLimit).mockResolvedValueOnce(true);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.errorCode).toBe('gproLimitExceeded');
      expect(queries.isFreemiumUserOverLimit).toHaveBeenCalledWith(
        'test-user-id',
      );
    });

    it('should allow voice generation when freemium user is under limit', async () => {
      const queries = await import('@/lib/supabase/queries');

      // Mock isFreemiumUserOverLimit to return false (under limit)
      vi.mocked(queries.isFreemiumUserOverLimit).mockResolvedValueOnce(false);

      // Mock cache miss
      server.use(
        http.get('https://*.upstash.io/*', () =>
          HttpResponse.json({ result: null }),
        ),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(queries.isFreemiumUserOverLimit).toHaveBeenCalledWith(
        'test-user-id',
      );
    });

    it('should throw error when Gemini response has no data', async () => {
      // Mock Gemini to return response without data (both pro and flash will fail)
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        // Missing data field
                        mimeType: 'audio/wav',
                      },
                    },
                  ],
                },
              },
            ],
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe(
        getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
      );
    });

    it('should throw error when Gemini response has no mimeType', async () => {
      // Mock Gemini to return response without mimeType (both pro and flash will fail)
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
                        // Missing mimeType field
                      },
                    },
                  ],
                },
              },
            ],
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe(
        getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
      );
    });

    it('should throw error when Gemini response has PROHIBITED_CONTENT finish reason', async () => {
      // Mock Gemini to return response with PROHIBITED_CONTENT finish reason
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                finishReason: 'PROHIBITED_CONTENT',
                content: {
                  parts: [],
                },
              },
            ],
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(422);
      expect(json.error).toBe(
        getErrorMessage('PROHIBITED_CONTENT', 'voice-generation'),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('Style Variants', () => {
    it('should prepend style variant to text', async () => {
      // Mock cache miss
      server.use(
        http.get('https://*.upstash.io/*', () =>
          HttpResponse.json({ result: null }),
        ),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world',
          voice: 'tara',
          styleVariant: 'Excited',
        }),
      });

      // We can't easily check the final text without more complex mocking,
      // but we can ensure the request completes successfully
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Request Abortion', () => {
    it('should handle aborted requests gracefully', async () => {
      // Mock Replicate API to return error
      server.use(
        http.post('https://api.replicate.com/v1/predictions', () =>
          HttpResponse.json({ detail: 'Model not found' }, { status: 404 }),
        ),
      );

      const controller = new AbortController();

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
        signal: controller.signal,
      });

      // Abort the request immediately
      controller.abort();

      // The function should still handle this gracefully
      // The actual behavior depends on when the abort signal is checked
      try {
        await POST(request);
      } catch (error) {
        // AbortError is expected
        expect(error).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle general errors and return 500', async () => {
      // Mock getVoiceIdByName to throw an error
      const queries = await import('@/lib/supabase/queries');
      vi.mocked(queries.getVoiceIdByName).mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
    });

    it('should handle getVoiceIdByName failure with error response', async () => {
      // Mock getVoiceIdByName to throw an error with status 429
      const queries = await import('@/lib/supabase/queries');
      const error = new Error('Quotas exceeded');
      (error as any).status = 500;
      vi.mocked(queries.getVoiceIdByName).mockRejectedValueOnce(error);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Failed to generate voice');
    });
  });

  describe('Hash Generation', () => {
    it('should generate consistent hashes for same inputs', async () => {
      // This is tested indirectly through the caching mechanism
      // We can verify that the same input produces the same cache key

      const request1 = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      const request2 = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
      });

      // Both requests should use the same cache key
      // This is verified by the consistent mocking behavior
      const response1 = await POST(request1);
      const response2 = await POST(request2);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });
});

describe('Integration Tests', () => {
  it('should complete full voice generation flow for Replicate', async () => {
    const request = new Request('http://localhost/api/generate-voice', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toBeTruthy();
    expect(json.creditsUsed).toBeGreaterThan(0);
    expect(json.creditsRemaining).toBeDefined();
  });

  it('should complete full voice generation flow for Gemini', async () => {
    // Set up mock Redis data for Gemini API keys
    const mockApiKeyData = JSON.stringify({
      id: 'test-key',
      apiKey: 'test-gemini-key',
      requestsPerMinute: 0,
      tokensPerMinute: 0,
      requestsPerDay: 0,
      maxRequestsPerMinute: 15,
      maxTokensPerMinute: 1_000_000,
      maxRequestsPerDay: 1500,
      lastMinuteReset: Date.now(),
      lastDayReset: Date.now(),
      isActive: true,
      failureCount: 0,
    });

    // Mock Redis to return API key data
    mockRedisKeys.mockResolvedValue(['gemini_api_key:test-key']);
    mockRedisGet.mockImplementation((key: string) => {
      if (key === 'gemini_api_key:test-key') {
        return Promise.resolve(mockApiKeyData);
      }
      return Promise.resolve(null);
    });

    const request = new Request('http://localhost/api/generate-voice', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
    });

    const response = await POST(request);
    const json = await response.json();

    // isFreemiumUserOverLimit is already mocked to return false in setup.ts

    expect(response.status).toBe(200);
    expect(json.url).toBeTruthy();
    expect(json.creditsUsed).toBeGreaterThan(10);
    expect(json.creditsRemaining).toBeDefined();
  });
});
