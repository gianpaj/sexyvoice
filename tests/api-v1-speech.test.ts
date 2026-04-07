import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/speech/route';
import {
  getCreditsAdmin,
  insertUsageEvent,
  reduceCreditsAdmin,
} from '@/lib/supabase/queries';
import { estimateCredits } from '@/lib/utils';
import {
  mockRatelimitLimit,
  mockUploadFileToR2,
  resetMockGoogleGenAIFactory,
  setMockGoogleGenAIFactory,
} from './setup';

const TEST_API_KEY = 'sk_live_Abc123Def456Ghi789Jkl012Mno345Pq';
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

  it('returns 400 when unsupported speed is provided', async () => {
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
        speed: 1.2,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('invalid_request');
    expect(json.error.message).toBe('Unrecognized key: "speed"');
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
        voice: 'poe',
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
        voice: 'poe',
        seed: 1234,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(generateContent).toHaveBeenCalled();
    expect(generateContent.mock.calls[0][0].config.seed).toBe(1234);
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
