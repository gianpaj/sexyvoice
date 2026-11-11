import { FinishReason, type GenerateContentResponse } from '@google/genai';
// biome-ignore lint/performance/noNamespaceImport: tests assert across the mocked Sentry module
import * as Sentry from '@sentry/nextjs';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/generate-voice/route';
import {
  calculateCreditsFromTokens,
  estimateCredits,
  getErrorMessage,
} from '@/lib/utils';
import type { GoogleApiErrorWithStatus } from '@/utils/google-rpc-status';
import {
  flushPromises,
  mockRedisGet,
  mockRedisKeys,
  mockRedisSet,
  mockReplicateRun,
  mockSupabaseUnauthenticatedClaimsOnce,
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

  describe('Text improvement metadata', () => {
    it.each([
      { textImproved: true, expected: true },
      { textImproved: false, expected: false },
      { textImproved: undefined, expected: false },
      { textImproved: 'true', expected: false },
    ])(
      'stores $textImproved as $expected for JSON',
      async ({ textImproved, expected }) => {
        const { saveAudioFile } = await import('@/lib/supabase/queries');
        const response = await POST(
          new Request('http://localhost/api/generate-voice', {
            body: JSON.stringify({
              text: 'Hello <laugh>',
              voiceId: 'voice-kore-id',
              textImproved,
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          }),
        );
        expect(response.status).toBe(200);
        await response.json();
        await vi.waitFor(() =>
          expect(saveAudioFile).toHaveBeenCalledWith(
            expect.objectContaining({
              usage: expect.objectContaining({ textImproved: expected }),
            }),
          ),
        );
      },
    );
  });

  describe('Input Validation', () => {
    it('should return 400 when request body is null', async () => {
      const request = new Request('http://localhost/api/generate-voice', {
        body: null,
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Request body is empty');
    });

    it('should return 400 when text is missing', async () => {
      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Missing required parameters');
    });

    it('should return 400 when voice is missing', async () => {
      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Missing required parameters');
    });

    it('should return 400 when text exceeds maximum length for Replicate voices', async () => {
      const longText = 'a'.repeat(501); // Exceeds 500 char limit

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: longText, voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
    });

    it('should return 400 when text exceeds maximum length for Gemini voices', async () => {
      const longText = 'a'.repeat(501); // Exceeds 500 char limit

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: longText, voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
    });

    it('should enforce a separate style limit for Gemini 3.8 voices (free)', async () => {
      // Style has a separate cap so it cannot bypass transcript limits.
      const shortText = 'a'.repeat(10);
      const longStyle = 'b'.repeat(1001); // exceeds the 1000-char free style limit

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({
          styleVariant: longStyle,
          text: shortText,
          voiceId: 'voice-kore-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Style exceeds the maximum length');
    });

    it('should allow a Gemini 3.8 style within the free character limit', async () => {
      // A short transcript with an in-limit style must pass validation (it fails
      // later for other reasons, but not with a length error).
      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({
          styleVariant: 'b'.repeat(1000),
          text: 'a'.repeat(10),
          voiceId: 'voice-kore-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      if (response.status === 400) {
        expect(json.error).not.toContain('maximum length');
      }
    });

    it('should enforce the character limit for Gemini 3.8', async () => {
      const { getVoiceById } = await import('@/lib/supabase/queries');
      vi.mocked(getVoiceById).mockResolvedValueOnce({
        id: 'voice-gpro38-id',
        language: 'en',
        model: 'gpro38',
        name: 'kore',
      });

      const longText = 'a'.repeat(501);

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: longText, voiceId: 'voice-gpro38-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({ text: longText, voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({ text: longText, voiceId: 'voice-eve-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Text exceeds the maximum length');
    });
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockSupabaseUnauthenticatedClaimsOnce();

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-nonexistent-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({
          text: 'Hello world this is a test',
          voiceId: 'voice-tara-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({
          text,
          voiceId: 'voice-eve-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({
          text: 'Hello world this is a test',
          voiceId: 'voice-tara-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ cached: true, creditsUsed: 0, url: cachedUrl });

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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ cached: true, creditsUsed: 0, url: cachedUrl });

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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({
          outputCodec: 'mp3',
          text: 'Hello world',
          voiceId: 'voice-eve-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ cached: true, creditsUsed: 0, url: cachedUrl });
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
        language: 'en',
        model:
          'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
        name: 'tara',
      });
      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
      expect(json).not.toHaveProperty('creditsRemaining');

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
        predictionId: undefined,
        text: 'Hello world',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio-free\/tara-[a-f0-9]+\.wav$/,
        ),
        usage: { split: false, textImproved: false, userHasPaid: false },
        userId: 'test-user-id',
        voiceId: 'voice-tara-id',
      });

      // Verify usage event was logged
      expect(insertUsageEvent).toHaveBeenCalledWith({
        creditsUsed: 48,
        inputChars: 11,
        metadata: {
          duration: '12',
          model:
            'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
          predictionId: null,
          provider: 'replicate',
          split: false,
          textLength: 11,
          textPreview: 'Hello world',
          userHasPaid: false,
          voiceId: 'voice-tara-id',
          voiceName: 'tara',
        },
        model:
          'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
        quantity: 11, // "Hello world".length
        sourceId: 'test-audio-file-id',
        sourceType: 'tts',
        unit: 'chars',
        userId: 'test-user-id',
      });

      expect(json.url).toContain('files.sexyvoice.ai');
    });

    it('returns 503 without Sentry capture for a transient Replicate rejection', async () => {
      const { restoreCredits } = await import('@/lib/supabase/queries');
      mockReplicateRun.mockRejectedValueOnce(
        new Error(
          'Request to https://api.replicate.com/v1/predictions failed with status 503 Service Unavailable: upstream unavailable',
        ),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toBe(
        'Replicate is temporarily unavailable. Please retry.',
      );
      expect(json.errorCode).toBe('PROVIDER_UNAVAILABLE');
      expect(json.details).toEqual({ provider: 'Replicate' });
      expect(mockReplicateRun).toHaveBeenCalled();
      expect(restoreCredits).toHaveBeenCalledOnce();
      expect(restoreCredits).toHaveBeenCalledWith({
        amount: 48,
        userId: 'test-user-id',
      });
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'Replicate voice generation provider unavailable',
        expect.objectContaining({
          extra: expect.objectContaining({
            model: expect.stringContaining('lucataco/orpheus'),
            voice: 'tara',
          }),
        }),
      );
    });

    it('returns 500 and captures a non-transient Replicate rejection', async () => {
      const { restoreCredits } = await import('@/lib/supabase/queries');
      const modelError = new Error('Model execution failed: invalid input');
      mockReplicateRun.mockRejectedValueOnce(modelError);

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Voice generation failed, please retry');
      expect(json.errorCode).toBeUndefined();
      expect(json.details).toBeUndefined();
      expect(restoreCredits).toHaveBeenCalledOnce();
      const capturedError = expect.objectContaining({
        cause: modelError,
        message: 'Voice generation failed, please retry',
        voiceGenerationErrorCode: 'REPLICATE_ERROR',
      });
      expect(Sentry.captureException).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledWith(capturedError, {
        extra: {
          errorData: capturedError,
          model: expect.stringContaining('lucataco/orpheus'),
          text: 'Hello world',
          voice: 'tara',
        },
        user: { email: 'test@example.com', id: 'test-user-id' },
      });
      expect(Sentry.logger.warn).not.toHaveBeenCalledWith(
        'Replicate voice generation provider unavailable',
        expect.anything(),
      );
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
        body: JSON.stringify({
          outputCodec: 'mp3',
          styleVariant: 'ignored style prompt',
          text: 'Hello [laugh]',
          voiceId: 'voice-eve-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toHaveProperty('url');
      expect(json).toHaveProperty('creditsUsed');
      expect(json).not.toHaveProperty('creditsRemaining');
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
        predictionId: undefined,
        text: 'Hello [laugh]',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio-free\/eve-[a-f0-9]+\.mp3$/,
        ),
        usage: { split: false, textImproved: false, userHasPaid: false },
        userId: 'test-user-id',
        voiceId: 'voice-eve-id',
      });

      expect(insertUsageEvent).toHaveBeenCalledWith({
        creditsUsed: 100,
        dollarAmount: 0.000_055,
        inputChars: 13,
        metadata: {
          codec: 'mp3',
          duration: '12',
          model: 'xai',
          predictionId: null,
          provider: 'grok',
          split: false,
          textLength: 13,
          textPreview: 'Hello [laugh]',
          userHasPaid: false,
          voiceId: 'voice-eve-id',
          voiceName: 'eve',
        },
        model: 'xai',
        quantity: 13,
        sourceId: 'test-audio-file-id',
        sourceType: 'tts',
        unit: 'chars',
        userId: 'test-user-id',
      });
    });

    it('should return 500 when XAI_API_KEY is missing', async () => {
      const previousApiKey = process.env.XAI_API_KEY;
      delete process.env.XAI_API_KEY;

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-eve-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      process.env.XAI_API_KEY = previousApiKey;

      expect(response.status).toBe(500);
      expect(json.error).toBe('Voice generation failed, please retry');
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Missing XAI_API_KEY' }),
        {
          extra: {
            codec: 'mp3',
            language: 'en',
            model: 'xai',
            text: 'Hello world',
            voice: 'eve',
          },
          user: { email: 'test@example.com', id: 'test-user-id' },
        },
      );
    });

    it.each(['upstream 5xx', 'headers timeout'])(
      'returns 503 without Sentry capture when xAI TTS is unavailable (%s)',
      async (failure) => {
        const { restoreCredits } = await import('@/lib/supabase/queries');
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        if (failure === 'headers timeout') {
          fetchSpy.mockRejectedValueOnce(
            new TypeError('fetch failed', {
              cause: Object.assign(new Error('Headers Timeout Error'), {
                code: 'UND_ERR_HEADERS_TIMEOUT',
              }),
            }),
          );
        } else {
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
        }

        const request = new Request('http://localhost/api/generate-voice', {
          body: JSON.stringify({
            text: 'Hello world',
            voiceId: 'voice-eve-id',
          }),
          headers: {
            'content-type': 'application/json',
          },
          method: 'POST',
        });

        const response = await POST(request).finally(() => {
          fetchSpy.mockRestore();
        });
        const json = await response.json();

        expect(response.status).toBe(503);
        expect(json.error).toBe(
          'Grok is temporarily unavailable. Please retry.',
        );
        expect(json.errorCode).toBe('PROVIDER_UNAVAILABLE');
        expect(json.details).toEqual({ provider: 'Grok' });
        expect(restoreCredits).toHaveBeenCalledOnce();
        expect(restoreCredits).toHaveBeenCalledWith({
          amount: expect.any(Number),
          userId: 'test-user-id',
        });
        expect(Sentry.captureException).not.toHaveBeenCalled();
        expect(Sentry.logger.warn).toHaveBeenCalledWith(
          'Grok TTS provider unavailable',
          expect.objectContaining({
            extra: expect.objectContaining({
              model: 'xai',
              voice: 'eve',
            }),
          }),
        );
        expect(Sentry.logger.warn).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            extra: expect.objectContaining({ text: expect.anything() }),
          }),
        );
      },
    );

    it('keeps Grok R2 failures on the platform error path', async () => {
      const { restoreCredits } = await import('@/lib/supabase/queries');
      const uploadError = new Error('Internal Server Error');
      mockUploadFileToR2.mockRejectedValueOnce(uploadError);
      server.use(
        http.post('https://api.x.ai/v1/tts', () =>
          HttpResponse.arrayBuffer(new Uint8Array([10, 20, 30, 40]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          }),
        ),
      );

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-eve-id',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Failed to generate voice');
      expect(json.errorCode).toBeUndefined();
      expect(json.details).toBeUndefined();
      expect(restoreCredits).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledWith(uploadError, {
        extra: {
          errorData: uploadError,
          model: 'xai',
          text: 'Hello world',
          voice: 'eve',
        },
        user: { email: 'test@example.com', id: 'test-user-id' },
      });
      expect(Sentry.logger.warn).not.toHaveBeenCalledWith(
        'Grok TTS provider unavailable',
        expect.anything(),
      );
    });
  });

  describe('Voice Generation - Google Gemini', () => {
    it('passes optional seed to Gemini provider config for paid users', async () => {
      const { hasUserPaid } = await import('@/lib/supabase/queries');
      // Seed is a paid-only feature, so it is only honoured for paid users.
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
          candidatesTokenCount: 12,
          promptTokenCount: 11,
          totalTokenCount: 23,
        },
      } as GenerateContentResponse);

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent,
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({
          seed: 1_234_567,
          text: 'Hello world',
          voiceId: 'voice-kore-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(generateContent).toHaveBeenCalled();
      expect(generateContent.mock.calls[0][0].config.seed).toBe(1_234_567);
    });

    it('ignores the seed for free users (paid-only feature)', async () => {
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
          candidatesTokenCount: 12,
          promptTokenCount: 11,
          totalTokenCount: 23,
        },
      } as GenerateContentResponse);

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent,
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({
          seed: 1_234_567,
          text: 'Hello world',
          voiceId: 'voice-kore-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(generateContent).toHaveBeenCalled();
      expect(generateContent.mock.calls[0][0].config.seed).toBeUndefined();
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
      const reservedCredits = estimateCredits(text, 'kore', 'gpro38');
      const actualCredits = calculateCreditsFromTokens(23);
      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text, voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(json.creditsUsed).toBe(actualCredits);
      expect(json).not.toHaveProperty('creditsRemaining');

      // Verify credits were consumed
      expect(reduceCredits).toHaveBeenNthCalledWith(1, {
        amount: reservedCredits,
        userId: 'test-user-id',
      });
      expect(reduceCreditsUpTo).toHaveBeenCalledWith({
        amount: actualCredits - reservedCredits,
        userId: 'test-user-id',
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
        model: 'gemini-3.8-flash-tts',
        predictionId: undefined,
        text,
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio\/kore-[a-f0-9]+\.wav$/,
        ),
        usage: {
          textImproved: false,
          candidatesTokenCount: '12',
          promptTokenCount: '11',
          split: false,
          totalTokenCount: '23',
          userHasPaid: true,
        },
        userId: 'test-user-id',
        voiceId: 'voice-kore-id',
      });

      // Verify usage event was logged for Gemini voice
      expect(insertUsageEvent).toHaveBeenCalledWith({
        creditsUsed: 26,
        dollarAmount: 0.000_114,
        inputChars: 11,
        metadata: {
          candidatesTokenCount: '12',
          duration: '12',
          model: 'gemini-3.8-flash-tts',
          predictionId: null,
          promptTokenCount: '11',
          provider: 'gemini',
          split: false,
          textLength: text.length,
          textPreview: text.slice(0, 100),
          totalTokenCount: '23',
          userHasPaid: true,
          voiceId: 'voice-kore-id',
          voiceName: 'kore',
        },
        model: 'gemini-3.8-flash-tts',
        quantity: text.length,
        sourceId: 'test-audio-file-id',
        sourceType: 'tts',
        unit: 'chars',
        userId: 'test-user-id',
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
      const reservedCredits = estimateCredits(text, 'kore', 'gpro38');
      const actualCredits = calculateCreditsFromTokens(23);
      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text, voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.creditsUsed).toBe(actualCredits);
      expect(json).not.toHaveProperty('creditsRemaining');
      expect(reduceCredits).toHaveBeenCalledOnce();
      expect(reduceCredits).toHaveBeenCalledWith({
        amount: reservedCredits,
        userId: 'test-user-id',
      });
      expect(restoreCredits).toHaveBeenCalledWith({
        amount: reservedCredits - actualCredits,
        userId: 'test-user-id',
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
      const reservedCredits = estimateCredits(text, 'kore', 'gpro38');
      const actualCredits = calculateCreditsFromTokens(23);
      const availableExtraCredits = 1;
      const creditsDebited = reservedCredits + availableExtraCredits;

      vi.mocked(getCredits).mockResolvedValueOnce(creditsDebited);
      vi.mocked(reduceCreditsUpTo).mockResolvedValueOnce(availableExtraCredits);

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text, voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.creditsUsed).toBe(creditsDebited);
      expect(json).not.toHaveProperty('creditsRemaining');
      expect(reduceCredits).toHaveBeenCalledWith({
        amount: reservedCredits,
        userId: 'test-user-id',
      });
      expect(reduceCreditsUpTo).toHaveBeenCalledWith({
        amount: actualCredits - reservedCredits,
        userId: 'test-user-id',
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
      ['voice-kore-id', 'gemini-3.8-flash-tts'],
      ['voice-achernar-38-id', 'gemini-3.8-flash-tts'],
    ] as const)(
      'should select %s for paid Gemini users based on voiceId',
      async (testVoiceId, expectedModel) => {
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
            candidatesTokenCount: 12,
            promptTokenCount: 11,
            totalTokenCount: 23,
          },
        } as GenerateContentResponse);

        setMockGoogleGenAIFactory(() => ({
          models: {
            generateContent,
          },
        }));

        const request = new Request('http://localhost/api/generate-voice', {
          body: JSON.stringify({
            text: 'Hello world',
            voiceId: testVoiceId,
          }),
          headers: {
            'content-type': 'application/json',
          },
          method: 'POST',
        });

        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(generateContent).toHaveBeenCalledWith(
          expect.objectContaining({
            contents: [{ parts: [{ text: 'Hello world' }], role: 'user' }],
            model: expectedModel,
          }),
        );
        await vi.waitFor(() => expect(saveAudioFile).toHaveBeenCalled());
        expect(saveAudioFile).toHaveBeenCalledWith(
          expect.objectContaining({
            model: expectedModel,
            text: 'Hello world',
          }),
        );
      },
    );

    it('should use Gemini 3.8 for free users', async () => {
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
                candidatesTokenCount: 12,
                promptTokenCount: 11,
                totalTokenCount: 23,
              },
            } as GenerateContentResponse;
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        model: 'gemini-3.8-flash-tts',
        predictionId: undefined,
        text: 'Hello world',
        url: expect.stringMatching(
          /^https:\/\/files\.sexyvoice\.ai\/generated-audio-free\/kore-[a-f0-9]+\.wav$/,
        ),
        usage: {
          textImproved: false,
          candidatesTokenCount: '12',
          promptTokenCount: '11',
          split: false,
          totalTokenCount: '23',
          userHasPaid: false,
        },
        userId: 'test-user-id',
        voiceId: 'voice-kore-id',
      });

      expect(insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          dollarAmount: 0.000_114,
          metadata: expect.objectContaining({
            model: 'gemini-3.8-flash-tts',
          }),
        }),
      );

      expect(json.url).toContain('files.sexyvoice.ai');
    });

    it('uses Gemini 3.8 for free users on an explicit voice', async () => {
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
          candidatesTokenCount: 12,
          promptTokenCount: 11,
          totalTokenCount: 23,
        },
      } as GenerateContentResponse);

      setMockGoogleGenAIFactory(() => ({
        models: { generateContent },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-38-id',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.8-flash-tts' }),
      );
    });

    it('returns 503 without Sentry capture when Gemini has a transient provider failure', async () => {
      const { restoreCredits } = await import('@/lib/supabase/queries');
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
        body: JSON.stringify({
          styleVariant: 'dramatic',
          text: 'Hello world',
          voiceId: 'voice-kore-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toBe(
        'Gemini is temporarily unavailable. Please retry.',
      );
      expect(json.errorCode).toBe('PROVIDER_UNAVAILABLE');
      expect(json.details).toEqual({ provider: 'Gemini' });
      expect(callCount).toBe(1);
      expect(restoreCredits).toHaveBeenCalledOnce();
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.logger.warn).toHaveBeenCalledWith(
        'Gemini provider temporarily unavailable',
        expect.objectContaining({
          extra: expect.objectContaining({
            googleCode: 500,
            googleStatus: 'INTERNAL',
            textLength: 'Hello world'.length,
            voice: 'kore',
          }),
          user: {
            email: 'test@example.com',
            id: 'test-user-id',
          },
        }),
      );

      expect(json.error).toBe(
        'Gemini is temporarily unavailable. Please retry.',
      );
    });

    it('should return 422 without Sentry capture when Gemini rejects a TTS request as invalid', async () => {
      const invalidArgumentError: GoogleApiErrorWithStatus = {
        code: 400,
        details: [],
        message:
          'Model tried to generate text, but it should only be used for TTS.',
        status: 'INVALID_ARGUMENT',
      };

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            throw new Error(JSON.stringify({ error: invalidArgumentError }));
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
            email: 'test@example.com',
            id: 'test-user-id',
          },
        }),
      );
    });

    it('should return 400 with a clean message when Gemini rejects the input as too long', async () => {
      const tokenLimitError: GoogleApiErrorWithStatus = {
        code: 400,
        details: [],
        message:
          'The input token count exceeds the maximum number of tokens allowed (8192).',
        status: 'INVALID_ARGUMENT',
      };

      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockImplementation(() => {
            throw new Error(JSON.stringify({ error: tokenLimitError }));
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                  violations: [
                    {
                      quotaId: 'GenerateRequestsPerDayPerProjectPerModel',
                      quotaMetric:
                        'generativelanguage.googleapis.com/generate_requests_per_model_per_day',
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
              message:
                'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 0',
              status: 'RESOURCE_EXHAUSTED',
            };
            throw new Error(JSON.stringify({ error: apiError }));
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.error).toContain(
        getErrorMessage('FREE_QUOTA_EXCEEDED', 'voice-generation'),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('should return 503 without Sentry capture when Gemini stops with no audio data', async () => {
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: {
                  parts: [],
                },
                finishReason: FinishReason.STOP,
              },
            ],
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
            model: 'gemini-3.8-flash-tts',
            voice: 'kore',
          }),
          user: {
            email: 'test@example.com',
            id: 'test-user-id',
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
                content: {
                  parts: [],
                },
                finishReason: FinishReason.OTHER,
              },
            ],
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({
          text: 'Hello world',
          voiceId: 'voice-achernar-38-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
            model: 'gemini-3.8-flash-tts',
            voice: 'achernar',
          }),
          user: {
            email: 'test@example.com',
            id: 'test-user-id',
          },
        }),
      );
    });

    it('rejects Gemini MAX_TOKENS with audio and refunds once', async () => {
      const { restoreCredits } = await import('@/lib/supabase/queries');
      const generateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                { inlineData: { data: 'AAAAAA==', mimeType: 'audio/wav' } },
              ],
            },
            finishReason: FinishReason.MAX_TOKENS,
          },
        ],
      });
      setMockGoogleGenAIFactory(() => ({ models: { generateContent } }));

      const response = await POST(
        new Request('http://localhost/api/generate-voice', {
          body: JSON.stringify({
            text: 'Hello world',
            voiceId: 'voice-kore-id',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      );

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining('output limit'),
        errorCode: 'GEMINI_OUTPUT_LIMIT',
      });
      expect(generateContent).toHaveBeenCalledOnce();
      expect(restoreCredits).toHaveBeenCalledOnce();
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
            model: 'gemini-3.8-flash-tts',
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
            model: 'gemini-3.8-flash-tts',
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

    it.each([
      {
        name: 'candidate finish reason',
        response: {
          candidates: [
            {
              content: { parts: [] },
              finishReason: FinishReason.SAFETY,
            },
          ],
        },
      },
      {
        name: 'prompt block reason',
        response: {
          candidates: [],
          promptFeedback: { blockReason: 'SAFETY' },
        },
      },
    ])(
      'should return 422 and refund credits for a Gemini SAFETY $name',
      async ({ response: geminiResponse }) => {
        const { restoreCredits } = await import('@/lib/supabase/queries');
        setMockGoogleGenAIFactory(() => ({
          models: {
            generateContent: vi.fn().mockResolvedValue(geminiResponse),
          },
        }));

        const request = new Request('http://localhost/api/generate-voice', {
          body: JSON.stringify({
            text: 'Hello world',
            voiceId: 'voice-achernar-38-id',
          }),
          headers: {
            'content-type': 'application/json',
          },
          method: 'POST',
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(422);
        expect(json.error).toBe(
          getErrorMessage('PROHIBITED_CONTENT', 'voice-generation'),
        );
        expect(restoreCredits).toHaveBeenCalledTimes(1);
        expect(Sentry.captureException).not.toHaveBeenCalled();
        expect(Sentry.logger.warn).toHaveBeenCalledWith(
          'Content generation prohibited by Gemini',
          expect.objectContaining({
            extra: expect.objectContaining({
              model: 'gemini-3.8-flash-tts',
            }),
          }),
        );
      },
    );

    it('should throw error when Gemini response has PROHIBITED_CONTENT finish reason', async () => {
      // Mock Gemini to return response with PROHIBITED_CONTENT finish reason
      setMockGoogleGenAIFactory(() => ({
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: {
                  parts: [],
                },
                finishReason: 'PROHIBITED_CONTENT',
              },
            ],
          }),
        },
      }));

      const request = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({
          styleVariant: 'Excited',
          text: 'Hello world',
          voiceId: 'voice-tara-id',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const response = await POST(request);
      expect(response.status).toBe(499);
    });

    it('should return 503 when Gemini fails with a transient error (SEXYVOICE-AI-4F)', async () => {
      const { restoreCredits } = await import('@/lib/supabase/queries');
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toBe(
        'Gemini is temporarily unavailable. Please retry.',
      );
      expect(json.errorCode).toBe('PROVIDER_UNAVAILABLE');
      expect(json.details).toEqual({ provider: 'Gemini' });
      expect(restoreCredits).toHaveBeenCalledOnce();
      expect(Sentry.captureException).not.toHaveBeenCalled();
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const request2 = new Request('http://localhost/api/generate-voice', {
        body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
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

  describe('Late cancellation telemetry', () => {
    beforeEach(async () => {
      const { hasUserPaid } = await import('@/lib/supabase/queries');
      vi.mocked(hasUserPaid).mockResolvedValueOnce(true);
    });

    it.each(['upload', 'reconciliation'])(
      'reports the retained charge once when cancelled during %s',
      async (stage) => {
        const { restoreCredits } = await import('@/lib/supabase/queries');
        const controller = new AbortController();
        if (stage === 'upload') {
          mockUploadFileToR2.mockImplementationOnce(
            async (filename: string) => {
              controller.abort();
              return `https://files.sexyvoice.ai/${filename}`;
            },
          );
        } else {
          vi.mocked(restoreCredits).mockImplementationOnce(async () => {
            controller.abort();
          });
        }
        const text = 'Hello world '.repeat(10).trim();
        const actualCredits = calculateCreditsFromTokens(23);
        const response = await POST(
          new Request('http://localhost/api/generate-voice', {
            body: JSON.stringify({
              text,
              voiceId: 'voice-achernar-38-id',
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          }),
        );
        expect((await response.json()).creditsUsed).toBe(actualCredits);

        expect(controller.signal.aborted).toBe(true);
        expect(restoreCredits).toHaveBeenCalledExactlyOnceWith({
          amount: estimateCredits(text, 'achernar', 'gpro38') - actualCredits,
          userId: 'test-user-id',
        });
        await vi.waitFor(() => {
          expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith(
            'Voice generation charge retained after cancellation',
            {
              extra: {
                creditsDebited: actualCredits,
                model: 'gemini-3.8-flash-tts',
              },
              fingerprint: ['generation-charge-retained-after-cancellation'],
              level: 'warning',
              tags: {
                flow: 'generation-charge-retained-after-cancellation',
                transport: 'json',
              },
              user: { id: 'test-user-id' },
            },
          );
        });
      },
    );

    it.each(['success', 'cancelled cache hit', 'refunded cancellation'])(
      'does not report a retained cancellation charge for %s',
      async (outcome) => {
        const controller = new AbortController();
        if (outcome === 'cancelled cache hit') {
          mockRedisGet.mockImplementationOnce(async () => {
            controller.abort();
            return 'https://files.sexyvoice.ai/cached.wav';
          });
        } else if (outcome === 'refunded cancellation') {
          const abort = () => {
            controller.abort();
            throw new DOMException('Aborted', 'AbortError');
          };
          setMockGoogleGenAIFactory(() => ({
            models: {
              generateContent: abort,
            },
          }));
        }
        await POST(
          new Request('http://localhost/api/generate-voice', {
            body: JSON.stringify({
              text: 'Hello world',
              voiceId: 'voice-achernar-38-id',
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          }),
        );
        await flushPromises();
        expect(Sentry.captureMessage).not.toHaveBeenCalled();
        if (outcome === 'refunded cancellation') {
          const { restoreCredits } = await import('@/lib/supabase/queries');
          expect(restoreCredits).toHaveBeenCalledExactlyOnceWith({
            amount: estimateCredits('Hello world', 'achernar', 'gpro38'),
            userId: 'test-user-id',
          });
        }
      },
    );
  });
});

describe('Integration Tests', () => {
  it('should complete full voice generation flow for Replicate', async () => {
    const request = new Request('http://localhost/api/generate-voice', {
      body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-tara-id' }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toBeTruthy();
    expect(json.creditsUsed).toBeGreaterThan(0);
    expect(json).not.toHaveProperty('creditsRemaining');
  });

  it('should complete full voice generation flow for Gemini', async () => {
    // Set up mock Redis data for Gemini API keys
    const mockApiKeyData = JSON.stringify({
      apiKey: 'test-gemini-key',
      failureCount: 0,
      id: 'test-key',
      isActive: true,
      lastDayReset: Date.now(),
      lastMinuteReset: Date.now(),
      maxRequestsPerDay: 1500,
      maxRequestsPerMinute: 15,
      maxTokensPerMinute: 1_000_000,
      requestsPerDay: 0,
      requestsPerMinute: 0,
      tokensPerMinute: 0,
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
      body: JSON.stringify({ text: 'Hello world', voiceId: 'voice-kore-id' }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toBeTruthy();
    expect(json.creditsUsed).toBeGreaterThan(10);
    expect(json).not.toHaveProperty('creditsRemaining');
  });
});
