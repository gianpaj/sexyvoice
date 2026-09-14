import { captureException } from '@sentry/nextjs';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/speech/route';
import { saveAudioFileAdmin } from '@/lib/supabase/queries';
import {
  mockReplicateRun,
  mockUploadFileToR2,
  resetMockGoogleGenAIFactory,
  server,
  setMockGoogleGenAIFactory,
} from './setup';

// ---------------------------------------------------------------------------
// Mocks specific to the v1 speech route (auth + rate-limit)
// ---------------------------------------------------------------------------

const mockValidateApiKey = vi.fn().mockResolvedValue({
  apiKeyId: 'test-api-key-id',
  keyHash: 'test-key-hash',
  userId: 'test-user-id',
});

const mockUpdateApiKeyLastUsed = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/api/auth', () => ({
  updateApiKeyLastUsed: (...args: unknown[]) =>
    mockUpdateApiKeyLastUsed(...args),
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

const mockConsumeRateLimit = vi.fn().mockResolvedValue({
  allowed: true,
  limit: 60,
  remaining: 59,
  resetAt: new Date(Date.now() + 60_000).toISOString(),
});

vi.mock('@/lib/api/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/rate-limit')>(
    '@/lib/api/rate-limit',
  );
  return {
    ...actual,
    consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY_SUFFIX = 'A'.repeat(32);
const TEST_AUTH_HEADER = `Bearer sk_live_${TEST_API_KEY_SUFFIX}`;

function speechRequest(
  body: Record<string, unknown>,
  authHeader = TEST_AUTH_HEADER,
) {
  return new Request('http://localhost/api/v1/speech', {
    body: JSON.stringify(body),
    headers: {
      authorization: authHeader,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('V1 Speech API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset to default successful responses
    mockValidateApiKey.mockResolvedValue({
      apiKeyId: 'test-api-key-id',
      keyHash: 'test-key-hash',
      userId: 'test-user-id',
    });
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    });
    resetMockGoogleGenAIFactory();
  });

  // -------------------------------------------------------------------------
  // Authentication & rate limiting
  // -------------------------------------------------------------------------
  describe('Authentication', () => {
    it('should return 401 when authorization header is missing', async () => {
      const request = new Request('http://localhost/api/v1/speech', {
        body: JSON.stringify({ input: 'Hello', model: 'xai', voice: 'eve' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error.code).toBe('invalid_api_key');
    });

    it('should return 401 when API key is invalid', async () => {
      mockValidateApiKey.mockResolvedValue(null);

      const response = await POST(
        speechRequest({ input: 'Hello', model: 'xai', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error.code).toBe('invalid_api_key');
    });

    it('should return 429 when rate limit is exceeded', async () => {
      mockConsumeRateLimit.mockResolvedValue({
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
      });

      const response = await POST(
        speechRequest({ input: 'Hello', model: 'xai', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.error.code).toBe('rate_limit_exceeded');
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  describe('Input Validation', () => {
    it('should return 400 for invalid model', async () => {
      const response = await POST(
        speechRequest({ input: 'Hello', model: 'nonexistent', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when input is empty', async () => {
      const response = await POST(
        speechRequest({ input: '', model: 'xai', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.type).toBe('invalid_request_error');
    });

    it('should return 404 when voice is not found', async () => {
      const response = await POST(
        speechRequest({
          input: 'Hello',
          model: 'xai',
          voice: 'nonexistent-voice',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe('voice_not_found');
    });

    it('should return 404 when voiceId is not found', async () => {
      const response = await POST(
        speechRequest({
          input: 'Hello',
          voiceId: 'nonexistent-voice-id',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe('voice_not_found');
      expect(json.error.param).toBe('voiceId');
    });

    it('should return 400 when voiceId is combined with voice and model', async () => {
      const response = await POST(
        speechRequest({
          input: 'Hello',
          model: 'xai',
          voice: 'eve',
          voiceId: 'voice-eve-id',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('invalid_request');
      expect(json.error.param).toBe('voiceId');
    });

    it('should return 400 when voice is missing model', async () => {
      const response = await POST(
        speechRequest({ input: 'Hello', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('invalid_request');
      expect(json.error.param).toBe('model');
    });

    it('should return 400 when voice model does not match requested model', async () => {
      // eve is a grok voice, but requesting orpheus model
      const response = await POST(
        speechRequest({ input: 'Hello', model: 'orpheus', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('model_not_found');
    });

    it('should return 400 for unsupported response_format', async () => {
      // orpheus only supports mp3, requesting wav should fail
      const response = await POST(
        speechRequest({
          input: 'Hello',
          model: 'orpheus',
          response_format: 'wav',
          voice: 'tara',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('unsupported_response_format');
    });
  });

  // -------------------------------------------------------------------------
  // Model body parameter
  // -------------------------------------------------------------------------
  describe('Model body parameter', () => {
    it.each([
      ['gpro', 'kore', 'gemini-2.5-pro-preview-tts'],
      ['gpro31', 'achernar', 'gemini-3.1-flash-tts-preview'],
    ] as const)(
      'should generate Gemini speech for model "%s" using %s',
      async (model, voice, expectedGeminiModel) => {
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
        });
        setMockGoogleGenAIFactory(() => ({
          models: {
            countTokens: vi.fn(),
            generateContent,
          },
        }));

        const response = await POST(
          speechRequest({
            input: 'Hello from Gemini',
            model,
            voice,
          }),
        );
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(generateContent).toHaveBeenCalledWith(
          expect.objectContaining({
            contents: [
              { parts: [{ text: 'Hello from Gemini' }], role: 'user' },
            ],
            model: expectedGeminiModel,
          }),
        );
        expect(json.url).toContain('.wav');
        expect(json.usage.model).toBe(expectedGeminiModel);
      },
    );

    it('should generate Gemini speech from voiceId without voice or model', async () => {
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
      });
      setMockGoogleGenAIFactory(() => ({
        models: {
          countTokens: vi.fn(),
          generateContent,
        },
      }));

      const response = await POST(
        speechRequest({
          input: 'Hello from a voice ID',
          voiceId: 'voice-achernar-31-id',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            { parts: [{ text: 'Hello from a voice ID' }], role: 'user' },
          ],
          model: 'gemini-3.1-flash-tts-preview',
        }),
      );
      expect(json.url).toContain('achernar-');
      expect(json.usage.model).toBe('gemini-3.1-flash-tts-preview');
    });

    it('should generate Orpheus speech for model "orpheus"', async () => {
      const response = await POST(
        speechRequest({
          input: 'Hello from Orpheus',
          model: 'orpheus',
          voice: 'tara',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(mockReplicateRun).toHaveBeenCalledWith(
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
        { input: { text: 'Hello from Orpheus', voice: 'tara' } },
        expect.any(Function),
      );
      expect(json.url).toContain('.mp3');
      expect(json.usage.model).toBe(
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Grok TTS generation
  // -------------------------------------------------------------------------
  describe('Grok TTS Generation', () => {
    it('should successfully generate voice using Grok with default mp3 format', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', async ({ request }) => {
          const body = (await request.json()) as {
            text: string;
            voice_id: string;
            language: string;
            output_format: { codec: string };
          };

          expect(body.text).toBe('Hello world');
          expect(body.voice_id).toBe('eve');
          expect(body.language).toBe('en');
          expect(body.output_format.codec).toBe('mp3');

          return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          });
        }),
      );

      const response = await POST(
        speechRequest({ input: 'Hello world', model: 'xai', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toBeDefined();
      expect(json.url).toContain('.mp3');
      expect(json.credits_used).toBeGreaterThan(0);
      expect(json.credits_remaining).toBeDefined();
      expect(json.usage.input_characters).toBe(11);
      expect(json.usage.model).toBe('xai');
      // Duration is parsed from the generated audio and persisted.
      expect(vi.mocked(saveAudioFileAdmin)).toHaveBeenCalledWith(
        expect.objectContaining({ duration: '12' }),
      );
    });

    it('should forward speed to the xAI TTS request for Grok voices', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', async ({ request }) => {
          const body = (await request.json()) as { speed?: number };

          expect(body.speed).toBe(1.2);

          return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          });
        }),
      );

      const response = await POST(
        speechRequest({
          input: 'Hello world',
          model: 'xai',
          speed: 1.2,
          voice: 'eve',
        }),
      );

      expect(response.status).toBe(200);
    });

    it('should generate voice using Grok with wav format', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', async ({ request }) => {
          const body = (await request.json()) as {
            output_format: { codec: string };
          };

          expect(body.output_format.codec).toBe('wav');

          return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'audio/wav' },
          });
        }),
      );

      const response = await POST(
        speechRequest({
          input: 'Hello world',
          model: 'xai',
          response_format: 'wav',
          voice: 'eve',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('.wav');
    });

    it('should allow both mp3 and wav for Grok model', async () => {
      // mp3 is accepted (default)
      server.use(
        http.post('https://api.x.ai/v1/tts', () =>
          HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          }),
        ),
      );

      const mp3Response = await POST(
        speechRequest({
          input: 'Hello',
          model: 'xai',
          response_format: 'mp3',
          voice: 'eve',
        }),
      );
      expect(mp3Response.status).toBe(200);
    });

    it('should normalize Grok language correctly', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', async ({ request }) => {
          const body = (await request.json()) as { language: string };

          // sal has language 'es-ES' which should be normalized to 'es-ES'
          expect(body.language).toBe('es-ES');

          return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          });
        }),
      );

      const response = await POST(
        speechRequest({ input: 'Hola mundo', model: 'xai', voice: 'sal' }),
      );
      expect(response.status).toBe(200);
    });

    it('returns provider unavailable without capture when xAI TTS fails', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', () =>
          HttpResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
          ),
        ),
      );

      const response = await POST(
        speechRequest({ input: 'Hello', model: 'xai', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error.code).toBe('provider_unavailable');
      expect(json.error.message).toBe(
        'Grok is temporarily unavailable. Please retry.',
      );
      expect(captureException).not.toHaveBeenCalled();
    });

    it('should include rate limit headers in response', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', () =>
          HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          }),
        ),
      );

      const response = await POST(
        speechRequest({ input: 'Hello', model: 'xai', voice: 'eve' }),
      );

      expect(response.headers.get('X-RateLimit-Limit-Requests')).toBeDefined();
      expect(
        response.headers.get('X-RateLimit-Remaining-Requests'),
      ).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset-Requests')).toBeDefined();
      expect(response.headers.get('request-id')).toMatch(/^req_sv_/);
    });

    it('should call uploadFileToR2 with speech API bucket', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', () =>
          HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          }),
        ),
      );

      const response = await POST(
        speechRequest({ input: 'Hello', model: 'xai', voice: 'eve' }),
      );

      expect(response.status).toBe(200);
      expect(mockUploadFileToR2).toHaveBeenCalledWith(
        expect.stringContaining('eve-'),
        expect.any(Buffer),
        'audio/mpeg',
        'test-speech-bucket',
        undefined,
      );
    });

    it('should ignore style prompts for Grok voices', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', async ({ request }) => {
          const body = (await request.json()) as { text: string };
          expect(body.text).toBe('Hello world');

          return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'audio/mpeg' },
          });
        }),
      );

      const response = await POST(
        speechRequest({
          input: 'Hello world',
          model: 'xai',
          style: 'happy',
          voice: 'eve',
        }),
      );

      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Credits
  // -------------------------------------------------------------------------
  describe('Credits', () => {
    it('should return 402 when credits are insufficient', async () => {
      // Import getCreditsAdmin mock to override credits
      const { getCreditsAdmin } = await import('@/lib/supabase/queries');
      vi.mocked(getCreditsAdmin).mockResolvedValueOnce(0);

      const response = await POST(
        speechRequest({ input: 'Hello', model: 'xai', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(402);
      expect(json.error.code).toBe('insufficient_credits');
    });
  });
});
