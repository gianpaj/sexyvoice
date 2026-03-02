import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/speech/route';
import {
  getCredits,
  insertUsageEvent,
  reduceCredits,
} from '@/lib/supabase/queries';
import { estimateCredits } from '@/lib/utils';
import {
  mockRedisGet,
  mockRedisIncr,
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
        model: 'kokoro',
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
        model: 'kokoro',
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

  it('returns cached response with usage and rate-limit headers', async () => {
    mockRedisGet.mockResolvedValueOnce('https://example.com/cached.mp3');
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: 'Hello world',
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.cached).toBe(true);
    expect(json.credits_used).toBe(0);
    expect(json.usage.input_characters).toBe(11);
    expect(insertUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
      }),
    );
    expect(response.headers.get('X-RateLimit-Limit-Requests')).toBe('60');
    expect(response.headers.get('request-id')).toBeTruthy();
  });

  it('returns 402 when credits are insufficient', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    vi.mocked(getCredits).mockResolvedValueOnce(1);

    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: 'Hello world this is a long enough sentence',
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(402);
    expect(json.error.code).toBe('insufficient_credits');
  });

  it('returns 429 when Redis rate limit is exceeded', async () => {
    mockRedisIncr.mockResolvedValueOnce(61);
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'kokoro',
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
        model: 'kokoro',
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

  it('validates max length against styled text', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: 'x'.repeat(498),
        style: 'aa',
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('input_too_long');
  });

  it('charges credits based on full styled text length', async () => {
    const input = 'hello';
    const style = 'calm and slow';
    const finalText = `${style}: ${input}`;
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'kokoro',
        input,
        style,
        voice: 'tara',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.usage.input_characters).toBe(finalText.length);
    expect(vi.mocked(reduceCredits)).toHaveBeenCalledWith({
      userId: 'test-user-id',
      amount: estimateCredits(
        finalText,
        'tara',
        'lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
      ),
    });
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

  it('uses seed in hash input to avoid cache key collisions', async () => {
    const unseededRequest = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: 'Hello world',
        voice: 'tara',
      }),
    });

    const seededRequest = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: TEST_AUTH_HEADER,
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: 'Hello world',
        voice: 'tara',
        seed: 999,
      }),
    });

    await POST(unseededRequest);
    await POST(seededRequest);

    expect(mockRedisGet).toHaveBeenCalledTimes(2);
    const firstKey = mockRedisGet.mock.calls[0][0];
    const secondKey = mockRedisGet.mock.calls[1][0];
    expect(firstKey).not.toBe(secondKey);
  });
});
