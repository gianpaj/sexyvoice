import { captureException } from '@sentry/nextjs';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/speech/route';
import {
  getCreditsAdmin,
  getVoiceByIdAdmin,
  getVoiceIdByNameAdmin,
  INSUFFICIENT_CREDITS_ERROR_CODE,
  insertUsageEvent,
  reduceCreditsAdmin,
  reduceCreditsUpToAdmin,
  restoreCredits,
  saveAudioFileAdmin,
} from '@/lib/supabase/queries';
import { creditsFromTokens, getTtsModel } from '@/lib/tts/models';

const estimateCredits = (text: string, voice: string, model: string) =>
  getTtsModel(model)?.estimateCredits(text, voice) ?? 0;

import {
  mockRatelimitLimit,
  mockReplicateRun,
  mockUploadFileToR2,
  resetMockGoogleGenAIFactory,
  server,
  setMockGoogleGenAIFactory,
} from './setup';

const TEST_API_KEY_SUFFIX = 'A'.repeat(32);
const TEST_API_KEY = `sk_live_${TEST_API_KEY_SUFFIX}`;
const TEST_AUTH_HEADER = `Bearer ${TEST_API_KEY}`;

describe('/api/v1/speech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockGoogleGenAIFactory();
  });

  it('returns 401 when API key is missing', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe('invalid_api_key');
    expect(response.headers.get('request-id')).toBeTruthy();
  });

  it('returns 400 for invalid request body', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.type).toBe('invalid_request_error');
    expect(json.error.code).toBe('invalid_request');
    expect(response.headers.get('request-id')).toBeTruthy();
  });

  it('ignores client request-id and generates prefixed request-id', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
        'request-id': 'debug-req-123',
      },
      method: 'POST',
    });

    const response = await POST(request);

    const requestId = response.headers.get('request-id');
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(/^req_sv_[0-9a-f]{32}$/);
    expect(requestId).not.toBe('debug-req-123');
  });

  it('returns 400 when speed is outside the supported range', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'xai',
        speed: 2,
        voice: 'eve',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('invalid_request');
    expect(json.error.param).toBe('speed');
  });

  it('returns 400 when temperature is outside the supported range', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        temperature: 3,
        voice: 'kore',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('invalid_request');
    expect(json.error.param).toBe('temperature');
  });

  it('scopes voice name lookups to the requested model', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    await POST(request);

    expect(vi.mocked(getVoiceIdByNameAdmin)).toHaveBeenCalledWith(
      'tara',
      true,
      [
        'gianpaj/cog-orpheus-3b-0.1-ft:666dc0c400952f2c18f0a46233dca2053ebef622754769878cd5497e20714650',
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      ],
    );
  });

  it('returns 404 when the voice does not exist for the requested model', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe('voice_not_found');
    expect(json.error.param).toBe('voice');
    expect(json.error.message).toBe(
      'Voice "tara" was not found for model "gpro38"',
    );
  });

  it('returns 402 when credits are insufficient', async () => {
    vi.mocked(getCreditsAdmin).mockResolvedValueOnce(1);

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world this is a long enough sentence',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(402);
    expect(json.error.code).toBe('insufficient_credits');
  });

  it('returns 402 when atomic credit reservation fails after precheck', async () => {
    vi.mocked(reduceCreditsAdmin).mockRejectedValueOnce(
      new Error('Insufficient credits', {
        cause: INSUFFICIENT_CREDITS_ERROR_CODE,
      }),
    );

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world this is a long enough sentence',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(402);
    expect(json.error.code).toBe('insufficient_credits');
    expect(mockUploadFileToR2).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60_000,
      success: false,
    });
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.code).toBe('rate_limit_exceeded');
  });

  it('returns unsupported_response_format code for unsupported format', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'orpheus',
        response_format: 'wav',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('unsupported_response_format');
    expect(json.error.param).toBe('response_format');
  });

  it('returns input_too_long for overly long raw input on non-Gemini models', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'x'.repeat(501),
        model: 'orpheus',
        style: 'aa',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('input_too_long');
    expect(json.error.message).toBe(
      'The input text exceeds the maximum length of 500 characters',
    );
  });

  it('validates max length against styled text for Gemini models', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'x'.repeat(499),
        model: 'gpro38',
        style: 'aa',
        voice: 'kore',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('input_too_long');
    expect(json.error.message).toBe(
      'The input text exceeds the maximum length of 500 characters after applying style',
    );
  });

  it('ignores style when charging credits for non-Gemini models', async () => {
    const input = 'hello';
    const style = 'calm and slow';
    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input,
        model: 'orpheus',
        style,
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.usage.input_characters).toBe(input.length);
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledWith({
      amount: estimateCredits(
        input,
        'tara',
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      ),
      userId: 'test-user-id',
    });
    expect(mockUploadFileToR2).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      'audio/mpeg',
      'test-speech-bucket',
      'https://api-speech-files.example.com',
    );
  });

  it('returns 400 for malformed JSON payloads', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      body: '{bad-json',
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('invalid_request');
    expect(json.error.message).toBe('Invalid JSON payload');
  });

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

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        seed: 1234,
        voice: 'kore',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalled();
    expect(generateContent.mock.calls[0][0].config.seed).toBe(1234);
  });

  it('keeps customer text out of the provider logs', async () => {
    const { logger } = await import('@sentry/nextjs');
    vi.mocked(logger.info).mockClear();
    setMockGoogleGenAIFactory(() => ({
      models: {
        countTokens: vi.fn(),
        generateContent: vi.fn().mockResolvedValue({
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
          usageMetadata: { totalTokenCount: 23 },
        }),
      },
    }));

    const response = await POST(
      new Request('http://localhost/api/v1/speech', {
        body: JSON.stringify({
          input: 'A private sentence',
          model: 'gpro38',
          style: 'whisper',
          voice: 'kore',
        }),
        headers: {
          authorization: TEST_AUTH_HEADER,
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).toContain('Gemini voice generation succeeded');
    expect(logged).not.toContain('A private sentence');
    expect(logged).not.toContain('whisper');
  });

  it('passes optional temperature to Gemini provider config', async () => {
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

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        temperature: 1.2,
        voice: 'kore',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalled();
    expect(generateContent.mock.calls[0][0].config.temperature).toBe(1.2);
  });

  it('accepts achernar with model gpro38 and calls GenAI with gemini-3.8-flash-tts', async () => {
    const reservedCredits = estimateCredits(
      'Hello world',
      'achernar',
      'gpro38',
    );
    const actualCredits = creditsFromTokens(42);
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
        candidatesTokenCount: 36,
        promptTokenCount: 6,
        totalTokenCount: 42,
      },
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        voice: 'achernar',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalled();
    expect(json.credits_used).toBe(actualCredits);
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenNthCalledWith(1, {
      amount: reservedCredits,
      userId: 'test-user-id',
    });
    expect(vi.mocked(reduceCreditsUpToAdmin)).toHaveBeenCalledWith({
      amount: actualCredits - reservedCredits,
      userId: 'test-user-id',
    });
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-3.8-flash-tts');
    expect(json.usage.model).toBe('gemini-3.8-flash-tts');
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsUsed: actualCredits,
        dollarAmount: 0.000_327,
        durationSeconds: 12,
        model: 'gemini-3.8-flash-tts',
      }),
    );
    expect(vi.mocked(saveAudioFileAdmin)).toHaveBeenCalledWith(
      expect.objectContaining({
        credits_used: actualCredits,
        duration: '12',
        model: 'gemini-3.8-flash-tts',
      }),
    );
  });

  it('deducts remaining available credits when API Gemini usage exceeds the reserved estimate', async () => {
    const input = 'Hello world';
    const reservedCredits = estimateCredits(input, 'achernar', 'gpro38');
    const actualCredits = creditsFromTokens(42);
    const remainingCredits = 1;
    const creditsDebited = reservedCredits + remainingCredits;

    vi.mocked(getCreditsAdmin)
      .mockResolvedValueOnce(creditsDebited)
      .mockResolvedValueOnce(0);
    vi.mocked(reduceCreditsUpToAdmin).mockResolvedValueOnce(remainingCredits);

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
        candidatesTokenCount: 36,
        promptTokenCount: 6,
        totalTokenCount: 42,
      },
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input,
        model: 'gpro38',
        voice: 'achernar',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.credits_used).toBe(creditsDebited);
    expect(json.credits_remaining).toBe(0);
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledWith({
      amount: reservedCredits,
      userId: 'test-user-id',
    });
    expect(vi.mocked(reduceCreditsUpToAdmin)).toHaveBeenCalledWith({
      amount: actualCredits - reservedCredits,
      userId: 'test-user-id',
    });
    expect(vi.mocked(saveAudioFileAdmin)).toHaveBeenCalledWith(
      expect.objectContaining({ credits_used: creditsDebited }),
    );
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ creditsUsed: creditsDebited }),
    );
  });

  it('refunds unused reserved credits when API Gemini token usage is below estimate', async () => {
    const input = 'Hello world '.repeat(5).trim();
    const reservedCredits = estimateCredits(input, 'achernar', 'gpro38');
    const actualCredits = creditsFromTokens(23);
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
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input,
        model: 'gpro38',
        voice: 'achernar',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.credits_used).toBe(actualCredits);
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledOnce();
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledWith({
      amount: reservedCredits,
      userId: 'test-user-id',
    });
    expect(vi.mocked(restoreCredits)).toHaveBeenCalledWith({
      amount: reservedCredits - actualCredits,
      userId: 'test-user-id',
    });
    expect(vi.mocked(saveAudioFileAdmin)).toHaveBeenCalledWith(
      expect.objectContaining({ credits_used: actualCredits }),
    );
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ creditsUsed: actualCredits }),
    );
  });

  it('accepts an achernar gpro38 Gemini voice row with model gpro38', async () => {
    vi.mocked(getVoiceIdByNameAdmin).mockResolvedValueOnce({
      id: 'voice-achernar-38-id',
      language: 'multiple',
      model: 'gpro38',
      name: 'achernar',
    });
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
        candidatesTokenCount: 36,
        promptTokenCount: 6,
        totalTokenCount: 42,
      },
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        voice: 'achernar',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-3.8-flash-tts');
    expect(json.usage.model).toBe('gemini-3.8-flash-tts');
  });

  it('returns provider quota errors from Gemini without capturing exceptions', async () => {
    const quotaError = new Error(
      JSON.stringify({
        error: {
          code: 429,
          message: 'Your prepayment credits are depleted.',
          status: 'RESOURCE_EXHAUSTED',
        },
      }),
    );
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(quotaError)
      .mockRejectedValueOnce(quotaError);
    setMockGoogleGenAIFactory(() => ({
      models: {
        countTokens: vi.fn(),
        generateContent,
      },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        voice: 'kore',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.type).toBe('rate_limit_error');
    expect(json.error.code).toBe('provider_quota_exceeded');
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('returns a content-policy error and refunds a Gemini SAFETY response', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: { parts: [] },
          finishReason: 'SAFETY',
        },
      ],
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        voice: 'achernar',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error.type).toBe('invalid_request_error');
    expect(json.error.code).toBe('content_policy_violation');
    expect(json.error.param).toBe('input');
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(restoreCredits).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('rejects Gemini MAX_TOKENS with audio and refunds once', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: 'AAAAAA==', mimeType: 'audio/wav' } },
            ],
          },
          finishReason: 'MAX_TOKENS',
        },
      ],
    });
    setMockGoogleGenAIFactory(() => ({ models: { generateContent } }));

    const response = await POST(
      new Request('http://localhost/api/v1/speech', {
        body: JSON.stringify({
          input: 'Hello world',
          model: 'gpro38',
          voice: 'achernar',
        }),
        headers: {
          authorization: TEST_AUTH_HEADER,
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'output_limit_exceeded',
        message: expect.stringContaining('output limit'),
        param: 'input',
        type: 'invalid_request_error',
      },
    });
    expect(generateContent).toHaveBeenCalledOnce();
    expect(restoreCredits).toHaveBeenCalledOnce();
    expect(mockUploadFileToR2).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('returns 503 and refunds when Gemini returns no audio', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: { parts: [] },
          finishReason: 'STOP',
        },
      ],
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        voice: 'achernar',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.type).toBe('server_error');
    expect(json.error.code).toBe('server_error');
    expect(json.error.param).toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(restoreCredits).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('labels failed policy refunds as content blocked', async () => {
    const refundError = new Error('Refund failed');
    vi.mocked(restoreCredits).mockRejectedValueOnce(refundError);
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: { parts: [] },
          finishReason: 'SAFETY',
        },
      ],
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        voice: 'achernar',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);

    expect(response.status).toBe(422);
    expect(captureException).toHaveBeenCalledWith(
      refundError,
      expect.objectContaining({
        extra: expect.objectContaining({ context: 'speech_content_blocked' }),
      }),
    );
  });

  it('returns provider unavailable from transient Gemini errors without capture', async () => {
    const transientError = new Error(
      JSON.stringify({
        error: {
          code: 500,
          message: 'Internal provider error.',
          status: 'INTERNAL',
        },
      }),
    );
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError);
    setMockGoogleGenAIFactory(() => ({
      models: {
        countTokens: vi.fn(),
        generateContent,
      },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'gpro38',
        voice: 'kore',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.type).toBe('server_error');
    expect(json.error.code).toBe('provider_unavailable');
    expect(json.error.message).toBe(
      'Gemini is temporarily unavailable. Please retry.',
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(restoreCredits).toHaveBeenCalledOnce();
    expect(captureException).not.toHaveBeenCalled();
  });

  it.each(['upstream 5xx', 'headers timeout'])(
    'returns provider unavailable from transient Grok errors without capture (%s)',
    async (failure) => {
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
                status: 503,
              },
            ),
          ),
        );
      }

      const request = new Request('http://localhost/api/v1/speech', {
        body: JSON.stringify({
          input: 'Hello world',
          model: 'xai',
          voice: 'eve',
        }),
        headers: {
          authorization: TEST_AUTH_HEADER,
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      const response = await POST(request).finally(() => {
        fetchSpy.mockRestore();
      });
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error.type).toBe('server_error');
      expect(json.error.code).toBe('provider_unavailable');
      expect(json.error.message).toBe(
        'Grok is temporarily unavailable. Please retry.',
      );
      expect(restoreCredits).toHaveBeenCalledOnce();
      expect(restoreCredits).toHaveBeenCalledWith({
        amount: expect.any(Number),
        userId: 'test-user-id',
      });
      expect(captureException).not.toHaveBeenCalled();
    },
  );

  it('keeps Grok R2 failures on the platform error path', async () => {
    const uploadError = new Error('Internal Server Error');
    mockUploadFileToR2.mockRejectedValueOnce(uploadError);
    server.use(
      http.post('https://api.x.ai/v1/tts', () =>
        HttpResponse.arrayBuffer(new Uint8Array([10, 20, 30, 40]).buffer, {
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      ),
    );

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'xai',
        voice: 'eve',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.type).toBe('server_error');
    expect(json.error.code).toBe('server_error');
    expect(restoreCredits).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledWith(uploadError, {
      extra: {
        apiKeyId: 'test-api-key-id',
        endpoint: '/api/v1/speech',
        requestId: expect.stringMatching(/^req_sv_[0-9a-f]{32}$/),
        userId: 'test-user-id',
      },
    });
  });

  it('returns provider unavailable for a transient Replicate rejection', async () => {
    mockReplicateRun.mockRejectedValueOnce(
      new Error(
        'Request to https://api.replicate.com/v1/predictions failed with status 503 Service Unavailable: upstream unavailable',
      ),
    );

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.type).toBe('server_error');
    expect(json.error.code).toBe('provider_unavailable');
    expect(json.error.message).toBe(
      'Replicate is temporarily unavailable. Please retry.',
    );
    expect(restoreCredits).toHaveBeenCalledOnce();
    expect(restoreCredits).toHaveBeenCalledWith({
      amount: expect.any(Number),
      userId: 'test-user-id',
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('returns server error for a non-transient Replicate rejection', async () => {
    const modelError = new Error('Model execution failed: invalid input');
    mockReplicateRun.mockRejectedValueOnce(modelError);

    const request = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.type).toBe('server_error');
    expect(json.error.code).toBe('server_error');
    expect(restoreCredits).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledWith(modelError, {
      extra: expect.objectContaining({
        apiKeyId: 'test-api-key-id',
        endpoint: '/api/v1/speech',
        requestId: expect.stringMatching(/^req_sv_[0-9a-f]{32}$/),
      }),
      user: { id: 'test-user-id' },
    });
  });

  it('always generates fresh audio (no caching)', async () => {
    const request1 = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const request2 = new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify({
        input: 'Hello world',
        model: 'orpheus',
        voice: 'tara',
      }),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    const [res1, res2] = await Promise.all([POST(request1), POST(request2)]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Both requests should trigger a real upload, not a cache hit
    expect(mockUploadFileToR2).toHaveBeenCalledTimes(2);
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledTimes(2);
  });
});

describe('/api/v1/speech configuration and lookup failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const speechRequest = (body: object) =>
    new Request('http://localhost/api/v1/speech', {
      body: JSON.stringify(body),
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

  it('refuses to generate when the speech files host is not configured', async () => {
    const publicUrl = process.env.R2_SPEECH_API_PUBLIC_URL;
    delete process.env.R2_SPEECH_API_PUBLIC_URL;
    try {
      const response = await POST(
        speechRequest({
          input: 'Hello world',
          model: 'orpheus',
          voice: 'tara',
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error.message).toBe(
        'Storage is not configured. Please contact support.',
      );
      expect(reduceCreditsAdmin).not.toHaveBeenCalled();
    } finally {
      process.env.R2_SPEECH_API_PUBLIC_URL = publicUrl;
    }
  });

  it('reports a failed voice lookup as a server error, not a missing voice', async () => {
    vi.mocked(getVoiceByIdAdmin).mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    const response = await POST(
      speechRequest({ input: 'Hello', voiceId: 'v1' }),
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe('server_error');
    expect(captureException).toHaveBeenCalledOnce();
    expect(reduceCreditsAdmin).not.toHaveBeenCalled();
  });
});
