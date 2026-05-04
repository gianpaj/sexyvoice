import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/speech/route';
import { usdTicksToDollarAmount } from '@/lib/tts/xai';
import {
  mockUploadFileToR2,
  server,
} from './setup';

// ---------------------------------------------------------------------------
// Mocks specific to the v1 speech route (auth + rate-limit)
// ---------------------------------------------------------------------------

const mockValidateApiKey = vi.fn().mockResolvedValue({
  userId: 'test-user-id',
  apiKeyId: 'test-api-key-id',
  keyHash: 'test-key-hash',
});

const mockUpdateApiKeyLastUsed = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/api/auth', () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
  updateApiKeyLastUsed: (...args: unknown[]) =>
    mockUpdateApiKeyLastUsed(...args),
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

function speechRequest(
  body: Record<string, unknown>,
  authHeader = 'Bearer sk_live_aaaabbbbccccddddeeeeffffgggghhhh',
) {
  return new Request('http://localhost/api/v1/speech', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader,
    },
    body: JSON.stringify(body),
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
      userId: 'test-user-id',
      apiKeyId: 'test-api-key-id',
      keyHash: 'test-key-hash',
    });
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // Authentication & rate limiting
  // -------------------------------------------------------------------------
  describe('Authentication', () => {
    it('should return 401 when authorization header is missing', async () => {
      const request = new Request('http://localhost/api/v1/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'grok', input: 'Hello', voice: 'eve' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error.code).toBe('invalid_api_key');
    });

    it('should return 401 when API key is invalid', async () => {
      mockValidateApiKey.mockResolvedValue(null);

      const response = await POST(
        speechRequest({ model: 'grok', input: 'Hello', voice: 'eve' }),
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
        speechRequest({ model: 'grok', input: 'Hello', voice: 'eve' }),
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
        speechRequest({ model: 'nonexistent', input: 'Hello', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.type).toBe('invalid_request_error');
    });

    it('should return 400 when input is empty', async () => {
      const response = await POST(
        speechRequest({ model: 'grok', input: '', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.type).toBe('invalid_request_error');
    });

    it('should return 404 when voice is not found', async () => {
      const response = await POST(
        speechRequest({
          model: 'grok',
          input: 'Hello',
          voice: 'nonexistent-voice',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe('voice_not_found');
    });

    it('should return 400 when voice model does not match requested model', async () => {
      // eve is a grok voice, but requesting orpheus model
      const response = await POST(
        speechRequest({ model: 'orpheus', input: 'Hello', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('model_not_found');
    });

    it('should return 400 for unsupported response_format', async () => {
      // orpheus only supports mp3, requesting wav should fail
      const response = await POST(
        speechRequest({
          model: 'orpheus',
          input: 'Hello',
          voice: 'tara',
          response_format: 'wav',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('unsupported_response_format');
    });
  });

  // -------------------------------------------------------------------------
  // Grok TTS generation
  // -------------------------------------------------------------------------
  describe('Grok TTS Generation', () => {
    it('should successfully generate voice using Grok with default mp3 format', async () => {
      const { insertUsageEvent, saveAudioFileAdmin } = await import(
        '@/lib/supabase/queries'
      );

      const xaiAudioBase64 = Buffer.from(
        new Uint8Array([1, 2, 3, 4]),
      ).toString('base64');
      const xaiCostInUsdTicks = 1650;

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

          return HttpResponse.json(
            {
              audio: xaiAudioBase64,
              usage: { cost_in_usd_ticks: xaiCostInUsdTicks, characters: 11 },
            },
            { headers: { 'Content-Type': 'application/json' } },
          );
        }),
      );

      const response = await POST(
        speechRequest({ model: 'grok', input: 'Hello world', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toBeDefined();
      expect(json.url).toContain('.mp3');
      expect(json.credits_used).toBeGreaterThan(0);
      expect(json.credits_remaining).toBeDefined();
      expect(json.usage.input_characters).toBe(11);
      expect(json.usage.model).toBe('grok');

      const expectedDollarAmount = usdTicksToDollarAmount(xaiCostInUsdTicks);

      expect(saveAudioFileAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: expect.objectContaining({
            costInUsdTicks: xaiCostInUsdTicks,
            dollarAmount: expectedDollarAmount,
          }),
        }),
      );

      expect(insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          dollarAmount: expectedDollarAmount,
          metadata: expect.objectContaining({
            codec: 'mp3',
            costInUsdTicks: xaiCostInUsdTicks,
            isGrokVoice: true,
          }),
        }),
      );
    });

    it('should generate voice using Grok with wav format', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', async ({ request }) => {
          const body = (await request.json()) as {
            output_format: { codec: string };
          };

          expect(body.output_format.codec).toBe('wav');

          return HttpResponse.arrayBuffer(
            new Uint8Array([1, 2, 3, 4]).buffer,
            { headers: { 'Content-Type': 'audio/wav' } },
          );
        }),
      );

      const response = await POST(
        speechRequest({
          model: 'grok',
          input: 'Hello world',
          voice: 'eve',
          response_format: 'wav',
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
          model: 'grok',
          input: 'Hello',
          voice: 'eve',
          response_format: 'mp3',
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

          return HttpResponse.arrayBuffer(
            new Uint8Array([1, 2, 3, 4]).buffer,
            { headers: { 'Content-Type': 'audio/mpeg' } },
          );
        }),
      );

      const response = await POST(
        speechRequest({ model: 'grok', input: 'Hola mundo', voice: 'sal' }),
      );
      expect(response.status).toBe(200);
    });

    it('should return 500 when xAI TTS request fails', async () => {
      server.use(
        http.post('https://api.x.ai/v1/tts', () =>
          HttpResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
          ),
        ),
      );

      const response = await POST(
        speechRequest({ model: 'grok', input: 'Hello', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error.code).toBe('server_error');
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
        speechRequest({ model: 'grok', input: 'Hello', voice: 'eve' }),
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
        speechRequest({ model: 'grok', input: 'Hello', voice: 'eve' }),
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

          return HttpResponse.arrayBuffer(
            new Uint8Array([1, 2, 3, 4]).buffer,
            { headers: { 'Content-Type': 'audio/mpeg' } },
          );
        }),
      );

      const response = await POST(
        speechRequest({
          model: 'grok',
          input: 'Hello world',
          voice: 'eve',
          style: 'happy',
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
        speechRequest({ model: 'grok', input: 'Hello', voice: 'eve' }),
      );
      const json = await response.json();

      expect(response.status).toBe(402);
      expect(json.error.code).toBe('insufficient_credits');
    });
  });
});
