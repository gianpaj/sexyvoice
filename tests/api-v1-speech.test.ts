import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/speech/route';
import { getCredits } from '@/lib/supabase/queries';
import { mockRedisGet } from './setup';

describe('/api/v1/speech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('returns 400 for invalid request body', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-external-api-key',
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
  });

  it('returns 400 when unsupported speed is provided', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-external-api-key',
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
    expect(json.error.code).toBe('speed_not_supported');
    expect(json.error.param).toBe('speed');
  });

  it('returns 400 when voice model does not match requested model', async () => {
    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-external-api-key',
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
        'x-api-key': 'test-external-api-key',
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
    expect(response.headers.get('X-RateLimit-Limit-Requests')).toBe('60');
  });

  it('returns 402 when credits are insufficient', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    vi.mocked(getCredits).mockResolvedValueOnce(1);

    const request = new Request('http://localhost/api/v1/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-external-api-key',
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
});
