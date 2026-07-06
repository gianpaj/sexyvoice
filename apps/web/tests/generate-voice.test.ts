import { FinishReason, type GenerateContentResponse } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/generate-voice/route';
import { createClient } from '@/lib/supabase/server';
import {
  calculateCreditsFromTokens,
  estimateCredits,
  getErrorMessage,
} from '@/lib/utils';
import type { GoogleApiErrorWithStatus } from '@/utils/google-rpc-status';
import {
  createDefaultStreamChunk,
  mockRedisGet,
  mockRedisKeys,
  mockRedisSet,
  mockReplicateRun,
  mockUploadFileToR2,
  resetMockGoogleGenAIFactory,
  server,
  setMockGoogleGenAIFactory,
} from './setup';

// ── SSE helpers ────────────────────────────────────────────────────────────
async function readSseBody(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    body += decoder.decode(value, { stream: true });
  }
  return body;
}

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
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Request body is empty');
    });

    it('should return 400 when text is missing', async () => {
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ voiceId: 'voice-tara-id' }),
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
        body: JSON.stringify({ text: longText, voiceId: 'voice-tara-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
    });

    it('should return 400 when text exceeds maximum length for Gemini voices', async () => {
      const longText = 'a'.repeat(501); // Exceeds 500 char limit

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: longText, voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
    });

    it('should enforce a separate style limit for Gemini 2.5 voices (free)', async () => {
      // Regression: styleVariant cannot bypass the per-tier limits. For Gemini
      // 2.5 it has its own character cap (1000 free) independent of the text cap.
      const shortText = 'a'.repeat(10);
      const longStyle = 'b'.repeat(1001); // exceeds the 1000-char free style limit

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: shortText,
          voiceId: 'voice-kore-id',
          styleVariant: longStyle,
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Style exceeds the maximum length');
    });

    it('should allow a Gemini 2.5 style within the free character limit', async () => {
      // A short transcript with an in-limit style must pass validation (it fails
      // later for other reasons, but not with a length error).
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'a'.repeat(10),
          voiceId: 'voice-kore-id',
          styleVariant: 'b'.repeat(1000),
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      if (response.status === 400) {
        expect(json.error).not.toContain('maximum length');
      }
    });

    it('should enforce the character limit for Gemini 3.1 (gpro31)', async () => {
      const { getVoiceById } = await import('@/lib/supabase/queries');
      vi.mocked(getVoiceById).mockResolvedValueOnce({
        id: 'voice-gpro31-id',
        name: 'kore',
        language: 'en',
        model: 'gpro31',
      });

      // HOTFIX: streaming is disabled, so gpro31 uses the standard per-tier
      // character limits like the Gemini 2.5 voices (500 chars for free users).
      const longText = 'a'.repeat(501);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: longText, voiceId: 'voice-gpro31-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('maximum length');
    });

    it('should return 400 when paid Gemini text exceeds maximum length', async () => {
      const longText = 'a'.repeat(1001); // Exceeds 1000 char paid Gemini limit

      const queries = await import('@/lib/supabase/queries');
      vi.mocked(queries.hasUserPaid).mockResolvedValueOnce(true);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: longText, voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
      expect(json.error).toContain('1000 characters');
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
        body: JSON.stringify({ text: longText, voiceId: 'voice-eve-id' }),
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
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
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-nonexistent-id',
        }),
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
          voiceId: 'voice-tara-id',
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
          voiceId: 'voice-eve-id',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(402);
      expect(json.error).toBe('Insufficient credits');
    });

    it('should return 402 when atomic credit reservation fails after precheck', async () => {
      const queries = await import('@/lib/supabase/queries');
      vi.mocked(queries.reduceCredits).mockRejectedValueOnce(
        new Error('Insufficient credits', {
          cause: queries.INSUFFICIENT_CREDITS_ERROR_CODE,
        }),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world this is a test',
          voiceId: 'voice-tara-id',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(402);
      expect(json.error).toBe('Insufficient credits');
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
      expect(queries.restoreCredits).not.toHaveBeenCalled();
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
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
        expect.stringContaining('generated-audio-free/kore-'),
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
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
          voiceId: 'voice-eve-id',
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
      const { saveAudioFile, insertUsageEvent, getVoiceById } = await import(
        '@/lib/supabase/queries'
      );
      // The generate-voice route uses the raw DB model string (not the external
      // API model ID), so restore the original Replicate versioned model for tara.
      vi.mocked(getVoiceById).mockResolvedValueOnce({
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
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

      // Duration parsing adds an extra async hop before persistence; wait for
      // the after() callback to finish before asserting its side effects.
      await vi.waitFor(() => expect(insertUsageEvent).toHaveBeenCalled());
      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 48,
        duration: '12',
        filename: expect.stringMatching(
          /^generated-audio-free\/tara-[a-f0-9]+\.wav$/,
        ),
        isPublic: false,
        model:
          'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
        usage: { split: false, userHasPaid: false },
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
          split: false,
          textPreview: 'Hello world',
          textLength: 11,
          duration: '12',
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
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
          voiceId: 'voice-eve-id',
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

      // Duration parsing adds an extra async hop before persistence; wait for
      // the after() callback to finish before asserting its side effects.
      await vi.waitFor(() => expect(insertUsageEvent).toHaveBeenCalled());
      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 100,
        duration: '12',
        filename: expect.stringMatching(
          /^generated-audio-free\/eve-[a-f0-9]+\.mp3$/,
        ),
        isPublic: false,
        model: 'xai',
        usage: { split: false, userHasPaid: false },
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
        creditsUsed: 100,
        dollarAmount: 0.000_055,
        metadata: {
          voiceId: 'voice-eve-id',
          voiceName: 'eve',
          model: 'xai',
          provider: 'grok',
          split: false,
          textPreview: 'Hello [laugh]',
          textLength: 13,
          duration: '12',
          userHasPaid: false,
          predictionId: null,
          codec: 'mp3',
        },
      });
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
          voiceId: 'voice-eve-id',
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
          voiceId: 'voice-eve-id',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Voice generation failed, please retry');
    });
  });

  describe('Voice Generation - Google Gemini', () => {
    it('passes optional seed to Gemini provider config', async () => {
      const generateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
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
      } as GenerateContentResponse);

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent,
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-kore-id',
          seed: 1_234_567,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(generateContent).toHaveBeenCalled();
      expect(generateContent.mock.calls[0][0].config.seed).toBe(1_234_567);
    });

    it('should successfully generate voice using Google Gemini', async () => {
      const {
        reduceCredits,
        reduceCreditsUpTo,
        saveAudioFile,
        getCredits,
        insertUsageEvent,
        hasUserPaid,
      } = await import('@/lib/supabase/queries');
      // Override the getCredits mock for this specific test
      vi.mocked(getCredits).mockResolvedValueOnce(3000);
      // Keep paid user flow coverage; Gemini paid users have a 1000 char limit.
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      const text = 'Hello world';
      const reservedCredits = estimateCredits(text, 'kore', 'gpro');
      const actualCredits = calculateCreditsFromTokens(23);
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text, voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(json.creditsUsed).toBe(actualCredits);
      expect(json.creditsRemaining).toBe(3000 - actualCredits);

      // Verify credits were consumed
      expect(reduceCredits).toHaveBeenNthCalledWith(1, {
        userId: 'test-user-id',
        amount: reservedCredits,
      });
      expect(reduceCreditsUpTo).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: actualCredits - reservedCredits,
      });
      expect(saveAudioFile).toHaveBeenCalledOnce();
      expect(mockUploadFileToR2).toHaveBeenCalledOnce();

      // Duration parsing adds an extra async hop before persistence; wait for
      // the after() callback to finish before asserting its side effects.
      await vi.waitFor(() => expect(insertUsageEvent).toHaveBeenCalled());
      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 26,
        duration: '12',
        filename: expect.stringMatching(
          /^generated-audio\/kore-[a-f0-9]+\.wav$/,
        ),
        isPublic: false,
        model: 'gemini-2.5-pro-preview-tts',
        usage: {
          split: false,
          promptTokenCount: '11',
          candidatesTokenCount: '12',
          totalTokenCount: '23',
          userHasPaid: true,
        },
        predictionId: undefined,
        text,
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio\/kore-[a-f0-9]+\.wav$/,
        ),
        userId: 'test-user-id',
        voiceId: 'voice-kore-id',
      });

      // Verify usage event was logged for Gemini voice
      expect(insertUsageEvent).toHaveBeenCalledWith({
        userId: 'test-user-id',
        sourceType: 'tts',
        sourceId: 'test-audio-file-id',
        unit: 'chars',
        quantity: text.length,
        creditsUsed: 26,
        dollarAmount: 0.000_251,
        metadata: {
          voiceId: 'voice-kore-id',
          voiceName: 'kore',
          model: 'gemini-2.5-pro-preview-tts',
          provider: 'gemini',
          split: false,
          textPreview: text.slice(0, 100),
          textLength: text.length,
          duration: '12',
          userHasPaid: true,
          predictionId: null,
        },
      });

      expect(json.url).toContain('files.sexyvoice.ai');
    });

    it('refunds unused reserved credits when Gemini token usage is below estimate', async () => {
      const {
        reduceCredits,
        restoreCredits,
        getCredits,
        hasUserPaid,
        saveAudioFile,
        insertUsageEvent,
      } = await import('@/lib/supabase/queries');
      vi.mocked(getCredits).mockResolvedValueOnce(1000);
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      const text = 'Hello world '.repeat(5).trim();
      const reservedCredits = estimateCredits(text, 'kore', 'gpro');
      const actualCredits = calculateCreditsFromTokens(23);
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text, voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.creditsUsed).toBe(actualCredits);
      expect(json.creditsRemaining).toBe(1000 - actualCredits);
      expect(reduceCredits).toHaveBeenCalledOnce();
      expect(reduceCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: reservedCredits,
      });
      expect(restoreCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: reservedCredits - actualCredits,
      });

      await vi.waitFor(() => expect(insertUsageEvent).toHaveBeenCalled());
      expect(saveAudioFile).toHaveBeenCalledWith(
        expect.objectContaining({ credits_used: actualCredits }),
      );
      expect(insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({ creditsUsed: actualCredits }),
      );
    });

    it('deducts remaining available credits when Gemini usage exceeds the reserved estimate', async () => {
      const {
        reduceCredits,
        reduceCreditsUpTo,
        getCredits,
        hasUserPaid,
        saveAudioFile,
        insertUsageEvent,
      } = await import('@/lib/supabase/queries');

      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      const text = 'Hello world';
      const reservedCredits = estimateCredits(text, 'kore', 'gpro');
      const actualCredits = calculateCreditsFromTokens(23);
      const availableExtraCredits = 1;
      const creditsDebited = reservedCredits + availableExtraCredits;

      vi.mocked(getCredits).mockResolvedValueOnce(creditsDebited);
      vi.mocked(reduceCreditsUpTo).mockResolvedValueOnce(availableExtraCredits);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text, voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.creditsUsed).toBe(creditsDebited);
      expect(json.creditsRemaining).toBe(0);
      expect(reduceCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: reservedCredits,
      });
      expect(reduceCreditsUpTo).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: actualCredits - reservedCredits,
      });

      await vi.waitFor(() => expect(insertUsageEvent).toHaveBeenCalled());
      expect(saveAudioFile).toHaveBeenCalledWith(
        expect.objectContaining({ credits_used: creditsDebited }),
      );
      expect(insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({ creditsUsed: creditsDebited }),
      );
    });

    it.each([
      ['voice-kore-id', 'gemini-2.5-pro-preview-tts'],
      ['voice-achernar-31-id', 'gemini-3.1-flash-tts-preview'],
    ] as const)('should select %s for paid Gemini users based on voiceId', async (testVoiceId, expectedModel) => {
      const { hasUserPaid, saveAudioFile } = await import(
        '@/lib/supabase/queries'
      );
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      const generateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
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
      } as GenerateContentResponse);

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent,
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: testVoiceId,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expectedModel,
          contents: [{ parts: [{ text: 'Hello world' }], role: 'user' }],
        }),
      );
      await vi.waitFor(() => expect(saveAudioFile).toHaveBeenCalled());
      expect(saveAudioFile).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expectedModel,
          text: 'Hello world',
        }),
      );
    });

    it('should use flash model directly for free Gemini users', async () => {
      const { insertUsageEvent, saveAudioFile } = await import(
        '@/lib/supabase/queries'
      );

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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(callCount).toBe(1);
      // Duration parsing adds an extra async hop before persistence; wait for
      // the after() callback to finish before asserting its side effects.
      await vi.waitFor(() => expect(insertUsageEvent).toHaveBeenCalled());
      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 26,
        duration: '12',
        filename: expect.stringMatching(
          /^generated-audio-free\/kore-[a-f0-9]+\.wav$/,
        ),
        isPublic: false,
        model: 'gemini-2.5-flash-preview-tts',
        usage: {
          split: false,
          promptTokenCount: '11',
          candidatesTokenCount: '12',
          totalTokenCount: '23',
          userHasPaid: false,
        },
        predictionId: undefined,
        text: 'Hello world',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio-free\/kore-[a-f0-9]+\.wav$/,
        ),
        userId: 'test-user-id',
        voiceId: 'voice-kore-id',
      });

      expect(insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          dollarAmount: 0.000_126,
          metadata: expect.objectContaining({
            model: 'gemini-2.5-flash-preview-tts',
          }),
        }),
      );

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

    it('uses Gemini 3.1 for free users on gpro31 voices (no flash variant)', async () => {
      // gpro31 is an explicit voice choice with no flash variant, so free users
      // who pick it run on 3.1 too — what we estimate/charge/cache must match.
      const generateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
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
      } as GenerateContentResponse);

      setMockGoogleGenAIFactory(() => ({
        models: { generateContent },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.1-flash-tts-preview' }),
      );
    });

    // HOTFIX: streaming is disabled (GEMINI_STREAMING_ENABLED === false); gpro31
    // now uses the non-streaming JSON path. Re-enable with the flag.
    it.skip('uses Gemini 3.1 for free users streaming gpro31 voices', async () => {
      const generateContentStream = vi
        .fn()
        .mockImplementation(async function* () {
          yield createDefaultStreamChunk();
        });
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);

      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      expect(generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.1-flash-tts-preview' }),
      );
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(callCount).toBe(2);
      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 26,
        duration: '12',
        filename: expect.stringMatching(
          /^generated-audio\/kore-[a-f0-9]+\.wav$/,
        ),
        isPublic: false,
        model: 'gemini-2.5-flash-preview-tts',
        usage: {
          split: false,
          promptTokenCount: '11',
          candidatesTokenCount: '12',
          totalTokenCount: '23',
          userHasPaid: true,
        },
        predictionId: undefined,
        text: 'Hello world',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio\/kore-[a-f0-9]+\.wav$/,
        ),
        userId: 'test-user-id',
        voiceId: 'voice-kore-id',
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
            voice: 'kore',
            styleVariant: '',
            model: 'gemini-2.5-pro-preview-tts',
            provider: 'gemini',
            textLength: 11,
            textPreview: 'Hello world',
            requestedOutputCodec: 'mp3',
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
            voice: 'kore',
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

    it('returns 503 without Sentry capture when flash model has a transient provider failure', async () => {
      const flashError = new Error(
        JSON.stringify({
          error: {
            code: 500,
            message: 'An internal error has occurred.',
            status: 'INTERNAL',
          },
        }),
      );

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
          voiceId: 'voice-kore-id',
          styleVariant: 'dramatic',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(callCount).toBe(1);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'Gemini provider temporarily unavailable',
        expect.objectContaining({
          extra: expect.objectContaining({
            googleCode: 500,
            googleStatus: 'INTERNAL',
            textLength: 'dramatic: Hello world'.length,
            voice: 'kore',
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

      expect(json.error).toBe(
        'Voice generation service temporarily unavailable. Please retry.',
      );
    });

    it('should return 422 without Sentry capture when Gemini rejects a TTS request as invalid', async () => {
      const invalidArgumentError: GoogleApiErrorWithStatus = {
        code: 400,
        message:
          'Model tried to generate text, but it should only be used for TTS.',
        status: 'INVALID_ARGUMENT',
        details: [],
      };

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            throw new Error(JSON.stringify({ error: invalidArgumentError }));
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(422);
      expect(json.error).toBe(
        getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'Gemini rejected TTS request',
        expect.objectContaining({
          extra: expect.objectContaining({
            googleCode: 400,
            googleStatus: 'INVALID_ARGUMENT',
            textLength: 'Hello world'.length,
            voice: 'kore',
          }),
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        }),
      );
    });

    it('should return 400 with a clean message when Gemini rejects the input as too long', async () => {
      const tokenLimitError: GoogleApiErrorWithStatus = {
        code: 400,
        message:
          'The input token count exceeds the maximum number of tokens allowed (8192).',
        status: 'INVALID_ARGUMENT',
        details: [],
      };

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            throw new Error(JSON.stringify({ error: tokenLimitError }));
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe(
        'Your text is too long for this voice. Please shorten it or use Split mode.',
      );
    });

    it('should handle Google API quota exceeded error', async () => {
      // Mock Google API quota error - should fail on both pro and flash models
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            // Both pro and flash models will throw the same quota error
            const apiError: GoogleApiErrorWithStatus = {
              code: 429,
              message:
                'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 0',
              status: 'RESOURCE_EXHAUSTED',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                  violations: [
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.error).toContain(
        getErrorMessage('FREE_QUOTA_EXCEEDED', 'voice-generation'),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(queries.isFreemiumUserOverLimit).toHaveBeenCalledWith(
        'test-user-id',
      );
    });

    it('should return 503 without Sentry capture when Gemini stops with no audio data', async () => {
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                finishReason: FinishReason.STOP,
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toBe(
        getErrorMessage('NO_AUDIO_DATA', 'voice-generation'),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'Gemini voice generation returned no audio data',
        expect.objectContaining({
          extra: expect.objectContaining({
            finishReason: FinishReason.STOP,
            model: 'gemini-2.5-flash-preview-tts',
            voice: 'kore',
          }),
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        }),
      );
    });

    it('should return 503 without Sentry capture when Gemini finishes with OTHER and no audio data', async () => {
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                finishReason: FinishReason.OTHER,
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
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toBe(
        getErrorMessage('NO_AUDIO_DATA', 'voice-generation'),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'Gemini voice generation returned no audio data',
        expect.objectContaining({
          extra: expect.objectContaining({
            finishReason: FinishReason.OTHER,
            model: 'gemini-3.1-flash-tts-preview',
            voice: 'achernar',
          }),
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        }),
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe(
        getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
      );
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Gemini 200 — no audio data',
        }),
        expect.objectContaining({
          extra: expect.objectContaining({
            blockReason: undefined,
            finishReason: undefined,
            hasData: false,
            isNoAudioData: false,
            mimeType: undefined,
            model: 'gemini-2.5-flash-preview-tts',
            voice: 'kore',
          }),
          user: { id: 'test-user-id' },
        }),
      );
      expect(Sentry.captureException).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
        }),
        expect.anything(),
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe(
        getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
      );
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Gemini 200 — no audio data',
        }),
        expect.objectContaining({
          extra: expect.objectContaining({
            finishReason: undefined,
            hasData: true,
            mimeType: undefined,
            model: 'gemini-2.5-flash-preview-tts',
            voice: 'kore',
          }),
          user: { id: 'test-user-id' },
        }),
      );
      expect(Sentry.captureException).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
        }),
        expect.anything(),
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
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
          voiceId: 'voice-tara-id',
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
    it('should return 499 when request signal is already aborted and a handler error occurs', async () => {
      // Cause an error deep in the handler so the outer catch is reached.
      // Because request.signal is already aborted, the outer catch should
      // return 499 instead of propagating the error.
      const queries = await import('@/lib/supabase/queries');
      vi.mocked(queries.getVoiceById).mockRejectedValueOnce(
        new Error('Simulated DB error'),
      );

      const controller = new AbortController();
      controller.abort(); // abort before the request is even created

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        signal: controller.signal,
      });

      const response = await POST(request);
      expect(response.status).toBe(499);
    });

    it('should return 499 for a Google AI SDK-wrapped AbortError (SEXYVOICE-AI-4Z)', async () => {
      // The Google AI SDK wraps native AbortError into a generic Error whose
      // name stays "Error" but whose message contains the word "aborted".
      // Previously this bypassed the `error.name === 'AbortError'` guard and
      // landed in Sentry. The isAbortError() helper must catch this pattern.
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi
            .fn()
            .mockRejectedValue(
              new Error(
                'exception AbortError: This operation was aborted sending request',
              ),
            ),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(499);
    });

    it('should return 503 when both Gemini pro and flash models fail with a transient error (SEXYVOICE-AI-4F)', async () => {
      // Both models throw a generic (non-googleapis) internal error — simulates
      // a transient Google outage. The route should return 503 with a friendly
      // message rather than crashing into the outer catch.
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockRejectedValue(
            new Error(
              JSON.stringify({
                error: {
                  code: 500,
                  message:
                    'An internal error has occurred. Please retry or report in https://developers.generativeai.google/guide/troubleshooting',
                  status: 'INTERNAL',
                },
              }),
            ),
          ),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toContain('temporarily unavailable');
    });
  });

  describe('Error Handling', () => {
    it('should handle general errors and return 500', async () => {
      // Mock getVoiceById to throw an error
      const queries = await import('@/lib/supabase/queries');
      vi.mocked(queries.getVoiceById).mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
    });

    it('should handle getVoiceById failure with error response', async () => {
      // Mock getVoiceById to throw an error with status 500
      const queries = await import('@/lib/supabase/queries');
      const error = new Error('Quotas exceeded');
      (error as any).status = 500;
      vi.mocked(queries.getVoiceById).mockRejectedValueOnce(error);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
      });

      const request2 = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
      });

      // Both requests should use the same cache key
      // This is verified by the consistent mocking behavior
      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2),
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  describe('Streaming disabled (hotfix)', () => {
    it('rejects stream: true for gpro31 with 409 and does not debit credits', async () => {
      const { reduceCredits } = await import('@/lib/supabase/queries');

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      // Stale bundles that still request the SSE path get a fast non-OK
      // response instead of a JSON body that would hang their SSE parser.
      expect(response.status).toBe(409);
      expect(response.headers.get('content-type')).not.toContain(
        'text/event-stream',
      );
      expect(json.error).toBeTruthy();
      // Fail-fast happens before any credit reservation.
      expect(reduceCredits).not.toHaveBeenCalled();
    });
  });

  // HOTFIX: Gemini 3.1 (gpro31) streaming is disabled via GEMINI_STREAMING_ENABLED
  // because progressive streaming corrupted some generations. The SSE path is
  // retained in the route for a future re-enable, so this suite is parked rather
  // than removed — flip the flag back to `true` to restore it.
  describe.skip('Streaming - Gemini SSE', () => {
    it('streams audio events and done event for Gemini voice', async () => {
      const {
        hasUserPaid,
        saveAudioFile,
        insertUsageEvent,
        reduceCredits,
        reduceCreditsUpTo,
      } = await import('@/lib/supabase/queries');
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);
      const text = 'Hello world';
      const reservedCredits = estimateCredits(text, 'achernar', 'gpro31');
      const actualCredits = calculateCreditsFromTokens(23);

      const generateContentStream = vi
        .fn()
        .mockImplementation(async function* () {
          yield createDefaultStreamChunk();
        });
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const body = await readSseBody(response);

      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      expect(generateContentStream).toHaveBeenCalled();
      expect(body).toContain('event: audio');
      expect(body).toContain('event: done');
      expect(body).toContain('files.sexyvoice.ai');
      expect(mockUploadFileToR2).toHaveBeenCalledOnce();
      expect(reduceCredits).toHaveBeenNthCalledWith(1, {
        userId: 'test-user-id',
        amount: reservedCredits,
      });
      expect(reduceCreditsUpTo).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: actualCredits - reservedCredits,
      });
      expect(saveAudioFile).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.1-flash-tts-preview',
          usage: expect.objectContaining({ stream: true }),
        }),
      );
      expect(insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ stream: true }),
        }),
      );
    });

    it('uses Gemini 3.1 model when voice is gpro31 and stream: true', async () => {
      const { hasUserPaid } = await import('@/lib/supabase/queries');
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      const generateContentStream = vi
        .fn()
        .mockImplementation(async function* () {
          yield createDefaultStreamChunk();
        });
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      expect(generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.1-flash-tts-preview' }),
      );
    });

    it('refunds unused reserved credits when stream token usage is below estimate', async () => {
      const { reduceCredits, restoreCredits } = await import(
        '@/lib/supabase/queries'
      );
      const text = 'Hello world '.repeat(10).trim();
      const reservedCredits = estimateCredits(text, 'achernar', 'gpro31');
      const actualCredits = calculateCreditsFromTokens(23);
      const generateContentStream = vi
        .fn()
        .mockImplementation(async function* () {
          yield createDefaultStreamChunk();
        });
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const body = await readSseBody(response);

      expect(body).toContain('event: done');
      expect(reduceCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: reservedCredits,
      });
      expect(restoreCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: reservedCredits - actualCredits,
      });
      expect(body).toContain(`"creditsUsed":${actualCredits}`);
      expect(body).toContain(`"creditsRemaining":${1000 - actualCredits}`);
    });

    it('returns SSE done-only on cache hit with stream: true', async () => {
      const { reduceCredits } = await import('@/lib/supabase/queries');
      const cachedUrl =
        'https://files.sexyvoice.ai/generated-audio/kore-cached.wav';
      mockRedisGet.mockResolvedValueOnce(cachedUrl);

      const generateContentStream = vi.fn();
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const body = await readSseBody(response);

      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      expect(body).toContain('event: done');
      expect(body).toContain(cachedUrl);
      expect(body).toContain('"cached":true');
      expect(body).not.toContain('event: audio');
      expect(generateContentStream).not.toHaveBeenCalled();
      expect(reduceCredits).not.toHaveBeenCalled();
    });

    it('ignores stream: true for Grok voices and returns JSON', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', () =>
          HttpResponse.arrayBuffer(new Uint8Array([10, 20, 30]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          }),
        ),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-eve-id',
          stream: true,
        }),
      });

      const response = await POST(request);

      expect(response.headers.get('content-type')).not.toContain(
        'text/event-stream',
      );
      expect(response.status).toBe(200);
    });

    it('ignores stream: true for Replicate voices and returns JSON', async () => {
      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-tara-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.headers.get('content-type')).not.toContain(
        'text/event-stream',
      );
      expect(json).toHaveProperty('url');
    });

    it('treats stream: true as non-streaming JSON for 2.5 Gemini models', async () => {
      // Only gpro31 (gemini-3.1) streams progressively; 2.5 models return the
      // whole clip at once, so stream: true falls back to the JSON path.
      const { hasUserPaid } = await import('@/lib/supabase/queries');
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-kore-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.headers.get('content-type')).not.toContain(
        'text/event-stream',
      );
      expect(json).toHaveProperty('url');
    });

    it('falls back to flash before first chunk when primary stream fails', async () => {
      const { hasUserPaid, saveAudioFile } = await import(
        '@/lib/supabase/queries'
      );
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      let callCount = 0;
      const generateContentStream = vi
        .fn()
        .mockImplementation(async function* () {
          callCount++;
          if (callCount === 1) throw new Error('Pro stream failed');
          yield createDefaultStreamChunk();
        });
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const body = await readSseBody(response);

      expect(body).toContain('event: done');
      expect(callCount).toBe(2);
      expect(saveAudioFile).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-flash-preview-tts' }),
      );
    });

    it('falls back to flash without retaining primary usage when the primary stream yields no audio', async () => {
      const { hasUserPaid, reduceCredits, saveAudioFile } = await import(
        '@/lib/supabase/queries'
      );
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      let callCount = 0;
      const generateContentStream = vi.fn().mockImplementation(function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            candidates: [{ content: { parts: [{}] }, finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 200,
              totalTokenCount: 300,
            },
          };
          return;
        }
        const fallbackChunk = createDefaultStreamChunk();
        fallbackChunk.usageMetadata = undefined;
        yield fallbackChunk;
      });
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const body = await readSseBody(response);

      expect(body).toContain('event: done');
      expect(callCount).toBe(2);
      expect(reduceCredits).toHaveBeenCalledWith({
        amount: estimateCredits('Hello world', 'achernar', 'gpro31'),
        userId: 'test-user-id',
      });
      expect(saveAudioFile).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash-preview-tts',
          usage: { stream: true, userHasPaid: true },
        }),
      );
    });

    it('emits error event and skips billing when stream yields no audio chunks', async () => {
      const { hasUserPaid, reduceCredits } = await import(
        '@/lib/supabase/queries'
      );
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      let callCount = 0;
      const generateContentStream = vi.fn().mockImplementation(function* () {
        callCount++;
        // Yield a chunk with no inlineData
        yield {
          candidates: [{ content: { parts: [{}] }, finishReason: 'STOP' }],
        };
      });
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const body = await readSseBody(response);

      expect(body).toContain('event: error');
      expect(body).not.toContain('event: done');
      expect(callCount).toBe(2);
      expect(reduceCredits).toHaveBeenCalled();
    });

    it.each([
      {
        errorCode: 'PROHIBITED_CONTENT' as const,
        name: 'prohibited content finish',
        terminalChunk: {
          candidates: [
            { content: { parts: [] }, finishReason: 'PROHIBITED_CONTENT' },
          ],
        },
      },
      {
        errorCode: 'OTHER_GEMINI_BLOCK' as const,
        name: 'safety prompt block',
        terminalChunk: {
          candidates: [],
          promptFeedback: { blockReason: 'SAFETY' },
        },
      },
    ])('does not retry a $name from the primary stream', async ({
      errorCode,
      terminalChunk,
    }) => {
      const { hasUserPaid, reduceCredits, restoreCredits } = await import(
        '@/lib/supabase/queries'
      );
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      let callCount = 0;
      const generateContentStream = vi.fn().mockImplementation(function* () {
        callCount++;
        yield terminalChunk;
      });
      setMockGoogleGenAIFactory(() => ({
        models: { generateContentStream },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const body = await readSseBody(response);

      expect(body).toContain('event: error');
      expect(body).toContain(getErrorMessage(errorCode, 'voice-generation'));
      expect(body).not.toContain('event: done');
      expect(callCount).toBe(1);
      expect(reduceCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: expect.any(Number),
      });
      expect(restoreCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: expect.any(Number),
      });
    });

    it('emits error event after audio started and refunds reserved credits when stream throws mid-flight', async () => {
      const { hasUserPaid, reduceCredits, restoreCredits } = await import(
        '@/lib/supabase/queries'
      );
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

      const generateContentStream = vi
        .fn()
        .mockImplementation(async function* () {
          yield createDefaultStreamChunk();
          throw new Error('Stream broke mid-flight');
        });
      setMockGoogleGenAIFactory(() => ({ models: { generateContentStream } }));

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-31-id',
          stream: true,
        }),
      });

      const response = await POST(request);
      const body = await readSseBody(response);

      expect(body).toContain('event: audio');
      expect(body).toContain('event: error');
      expect(body).not.toContain('event: done');
      expect(reduceCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: expect.any(Number),
      });
      expect(restoreCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: expect.any(Number),
      });
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
      body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
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
      body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
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
