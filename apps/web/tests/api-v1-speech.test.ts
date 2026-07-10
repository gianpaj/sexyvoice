import { captureException } from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/speech/route';
import {
  getCreditsAdmin,
  getVoiceIdByNameAdmin,
  INSUFFICIENT_CREDITS_ERROR_CODE,
  insertUsageEvent,
  reduceCreditsAdmin,
  reduceCreditsUpToAdmin,
  restoreCredits,
  saveAudioFileAdmin,
} from '@/lib/supabase/queries';
import { calculateCreditsFromTokens, estimateCredits } from '@/lib/utils';
import {
  mockRatelimitLimit,
  mockUploadFileToR2,
  resetMockGoogleGenAIFactory,
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
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hello world',
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe('invalid_api_key');
    expect(response.headers.get('request-id')).toBeTruthy();
  });

  it('returns 400 for invalid request body', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        input: 'Hello world',
        voice: 'tara',
      }),
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
      method: 'POST',
      headers: {
        authorization: TEST_AUTH_HEADER,
        'content-type': 'application/json',
        'request-id': 'debug-req-123',
      },
      body: JSON.stringify({
        input: 'Hello world',
        voice: 'tara',
      }),
    });

    const response = await POST(request);

    const requestId = response.headers.get('request-id');
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(/^req_sv_[0-9a-f]{32}$/);
    expect(requestId).not.toBe('debug-req-123');
  });

  it('returns 400 when speed is outside the supported range', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'xai',
        input: 'Hello world',
        voice: 'eve',
        speed: 2,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('invalid_request');
    expect(json.error.param).toBe('speed');
  });

  it('returns 400 when temperature is outside the supported range', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro',
        input: 'Hello world',
        voice: 'kore',
        temperature: 3,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('invalid_request');
    expect(json.error.param).toBe('temperature');
  });

  it('returns 400 when voice model does not match requested model', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro',
        input: 'Hello world',
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('model_not_found');
  });

  it('returns 402 when credits are insufficient', async () => {
    vi.mocked(getCreditsAdmin).mockResolvedValueOnce(1);

    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hello world this is a long enough sentence',
        voice: 'tara',
      }),
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
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hello world this is a long enough sentence',
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(402);
    expect(json.error.code).toBe('insufficient_credits');
    expect(mockUploadFileToR2).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hello world',
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.code).toBe('rate_limit_exceeded');
  });

  it('returns unsupported_response_format code for unsupported format', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hello world',
        voice: 'tara',
        response_format: 'wav',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('unsupported_response_format');
    expect(json.error.param).toBe('response_format');
  });

  it('returns input_too_long for overly long raw input on non-Gemini models', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'x'.repeat(501),
        style: 'aa',
        voice: 'tara',
      }),
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
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro',
        input: 'x'.repeat(497),
        style: 'aa',
        voice: 'kore',
      }),
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
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'orpheus',
        input,
        style,
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.usage.input_characters).toBe(input.length);
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledWith({
      userId: 'test-user-id',
      amount: estimateCredits(
        input,
        'tara',
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      ),
    });
    expect(mockUploadFileToR2).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      'audio/mpeg',
      'test-speech-bucket',
      undefined,
    );
  });

  it('returns 400 for malformed JSON payloads', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: '{bad-json',
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
        promptTokenCount: 11,
        candidatesTokenCount: 12,
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
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro',
        input: 'Hello world',
        voice: 'kore',
        seed: 1234,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalled();
    expect(generateContent.mock.calls[0][0].config.seed).toBe(1234);
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
        promptTokenCount: 11,
        candidatesTokenCount: 12,
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
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro',
        input: 'Hello world',
        voice: 'kore',
        temperature: 1.2,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalled();
    expect(generateContent.mock.calls[0][0].config.temperature).toBe(1.2);
  });

  it('accepts achernar with model gpro31 and calls GenAI with gemini-3.1-flash-tts-preview', async () => {
    const reservedCredits = estimateCredits(
      'Hello world',
      'achernar',
      'gpro31',
    );
    const actualCredits = calculateCreditsFromTokens(42);
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
        promptTokenCount: 6,
        candidatesTokenCount: 36,
        totalTokenCount: 42,
      },
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro31',
        input: 'Hello world',
        voice: 'achernar',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalled();
    expect(json.credits_used).toBe(actualCredits);
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenNthCalledWith(1, {
      userId: 'test-user-id',
      amount: reservedCredits,
    });
    expect(vi.mocked(reduceCreditsUpToAdmin)).toHaveBeenCalledWith({
      userId: 'test-user-id',
      amount: actualCredits - reservedCredits,
    });
    expect(generateContent.mock.calls[0][0].model).toBe(
      'gemini-3.1-flash-tts-preview',
    );
    expect(json.usage.model).toBe('gemini-3.1-flash-tts-preview');
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        dollarAmount: 0.000_726,
        model: 'gemini-3.1-flash-tts-preview',
        durationSeconds: 12,
        creditsUsed: actualCredits,
      }),
    );
    expect(vi.mocked(saveAudioFileAdmin)).toHaveBeenCalledWith(
      expect.objectContaining({
        credits_used: actualCredits,
        duration: '12',
        model: 'gemini-3.1-flash-tts-preview',
      }),
    );
  });

  it('deducts remaining available credits when API Gemini usage exceeds the reserved estimate', async () => {
    const input = 'Hello world';
    const reservedCredits = estimateCredits(input, 'achernar', 'gpro31');
    const actualCredits = calculateCreditsFromTokens(42);
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
        promptTokenCount: 6,
        candidatesTokenCount: 36,
        totalTokenCount: 42,
      },
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro31',
        input,
        voice: 'achernar',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.credits_used).toBe(creditsDebited);
    expect(json.credits_remaining).toBe(0);
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledWith({
      userId: 'test-user-id',
      amount: reservedCredits,
    });
    expect(vi.mocked(reduceCreditsUpToAdmin)).toHaveBeenCalledWith({
      userId: 'test-user-id',
      amount: actualCredits - reservedCredits,
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
    const reservedCredits = estimateCredits(input, 'achernar', 'gpro31');
    const actualCredits = calculateCreditsFromTokens(23);
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
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro31',
        input,
        voice: 'achernar',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.credits_used).toBe(actualCredits);
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledOnce();
    expect(vi.mocked(reduceCreditsAdmin)).toHaveBeenCalledWith({
      userId: 'test-user-id',
      amount: reservedCredits,
    });
    expect(vi.mocked(restoreCredits)).toHaveBeenCalledWith({
      userId: 'test-user-id',
      amount: reservedCredits - actualCredits,
    });
    expect(vi.mocked(saveAudioFileAdmin)).toHaveBeenCalledWith(
      expect.objectContaining({ credits_used: actualCredits }),
    );
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ creditsUsed: actualCredits }),
    );
  });

  it('accepts an achernar gpro31 Gemini voice row with model gpro31', async () => {
    vi.mocked(getVoiceIdByNameAdmin).mockResolvedValueOnce({
      id: 'voice-achernar-31-id',
      name: 'achernar',
      language: 'multiple',
      model: 'gpro31',
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
        promptTokenCount: 6,
        candidatesTokenCount: 36,
        totalTokenCount: 42,
      },
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro31',
        input: 'Hello world',
        voice: 'achernar',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(generateContent.mock.calls[0][0].model).toBe(
      'gemini-3.1-flash-tts-preview',
    );
    expect(json.usage.model).toBe('gemini-3.1-flash-tts-preview');
  });

  it('rejects gpro31 requests for gpro DB voices', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro31',
        input: 'Hello world',
        voice: 'kore',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('model_not_found');
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
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro',
        input: 'Hello world',
        voice: 'kore',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.type).toBe('rate_limit_error');
    expect(json.error.code).toBe('provider_quota_exceeded');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('falls back to gemini-2.5-flash-preview-tts when gpro31 primary call fails', async () => {
    let callCount = 0;
    const generateContent = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('3.1 model unavailable');
      return Promise.resolve({
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
          promptTokenCount: 5,
          candidatesTokenCount: 10,
          totalTokenCount: 15,
        },
      });
    });
    setMockGoogleGenAIFactory(() => ({
      models: { countTokens: vi.fn(), generateContent },
    }));

    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro31',
        input: 'Hello world',
        voice: 'achernar',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0][0].model).toBe(
      'gemini-3.1-flash-tts-preview',
    );
    expect(generateContent.mock.calls[1][0].model).toBe(
      'gemini-2.5-flash-preview-tts',
    );
    expect(json.usage.model).toBe('gemini-2.5-flash-preview-tts');
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        dollarAmount: 0.000_103,
        model: 'gemini-2.5-flash-preview-tts',
        durationSeconds: 12,
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
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'gpro',
        input: 'Hello world',
        voice: 'kore',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.type).toBe('server_error');
    expect(json.error.code).toBe('provider_unavailable');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('always generates fresh audio (no caching)', async () => {
    const request1 = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hello world',
        voice: 'tara',
      }),
    });

    const request2 = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hello world',
        voice: 'tara',
      }),
    });

    const [res1, res2] = await Promise.all([POST(request1), POST(request2)]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Both requests should trigger a real upload, not a cache hit
    expect(mockUploadFileToR2).toHaveBeenCalledTimes(2);
    expect(vi.mocked(insertUsageEvent)).toHaveBeenCalledTimes(2);
  });
});
