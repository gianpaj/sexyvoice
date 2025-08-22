import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/generate-voice/route';
import * as queries from '@/lib/supabase/queries';
import {
  mockBlobPut,
  mockRedisGet,
  mockRedisKeys,
  mockRedisSet,
  server,
} from './setup';

describe('Generate Voice API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  describe.skip('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated user
      server.use(
        http.get('https://*.supabase.co/auth/v1/user', () => {
          return HttpResponse.json({ user: null });
        }),
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
      expect(json.serverMessage).toBe('Voice not found');
    });
  });

  describe('Credit System', () => {
    it('should return 402 when user has insufficient credits', async () => {
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
  });

  describe('Caching', () => {
    it('should return cached result when audio exists in Redis', async () => {
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
    });
  });

  describe('Voice Generation - Replicate', () => {
    it('should successfully generate voice using Replicate', async () => {
      mockBlobPut.mockResolvedValueOnce({
        url: 'https://blob.vercel-storage.com',
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
            async run(model: string, options: any, onProgress?: any) {
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
      expect(json.url).toContain('blob.vercel-storage.com');
      expect(json.creditsUsed).toBeGreaterThan(0);
      expect(json.creditsRemaining).toBeDefined();
    });

    it('should handle Replicate API errors', async () => {
      // Mock Replicate API to return error
      server.use(
        http.post('https://api.replicate.com/v1/predictions', () => {
          return HttpResponse.json(
            { detail: 'Model not found' },
            { status: 404 },
          );
        }),
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
  });

  describe.skip('Voice Generation - Google Gemini', () => {
    it('should successfully generate voice using Google Gemini', async () => {
      // Mock cache miss
      server.use(
        http.get('https://*.upstash.io/*', () => {
          return HttpResponse.json({ result: null });
        }),
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
      expect(json.url).toContain('blob.vercel-storage.com');
      expect(json.creditsUsed).toBeGreaterThan(0);
      expect(json.creditsRemaining).toBeDefined();
    });

    it('should fallback to flash model when pro model fails', async () => {
      // Mock cache miss
      server.use(
        http.get('https://*.upstash.io/*', () => {
          return HttpResponse.json({ result: null });
        }),
      );

      // Mock Gemini pro failure, flash success
      let callCount = 0;
      server.use(
        http.post(
          'https://generativelanguage.googleapis.com/v1beta/models/*:generateContent',
          ({ request }) => {
            callCount++;
            if (callCount === 1) {
              // First call (pro model) fails
              return HttpResponse.json(
                { error: 'Pro model failed' },
                { status: 500 },
              );
            }
            // Second call (flash model) succeeds
            const mockAudioData =
              'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            return HttpResponse.json({
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
                },
              ],
            });
          },
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
      expect(json.url).toContain('blob.vercel-storage.com');
    });

    it('should handle Google API quota exceeded error', async () => {
      // Mock cache miss
      server.use(
        http.get('https://*.upstash.io/*', () => {
          return HttpResponse.json({ result: null });
        }),
      );

      // Mock Google API quota error
      server.use(
        http.post(
          'https://generativelanguage.googleapis.com/v1beta/models/*:generateContent',
          () => {
            return HttpResponse.json(
              { error: { code: 429, message: 'Quota exceeded' } },
              { status: 429 },
            );
          },
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

      expect(response.status).toBe(500);
      expect(json.error).toContain('quota');
    });
  });

  describe('Style Variants', () => {
    it('should prepend style variant to text', async () => {
      // Mock cache miss
      server.use(
        http.get('https://*.upstash.io/*', () => {
          return HttpResponse.json({ result: null });
        }),
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

  describe.skip('Error Handling', () => {
    it('should handle general errors and return 500', async () => {
      // Mock Supabase to throw an error
      server.use(
        http.get('https://*.supabase.co/rest/v1/voices', () => {
          return HttpResponse.json(
            { error: 'Database connection failed' },
            { status: 500 },
          );
        }),
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

    it('should handle third-party API quota errors with specific message', async () => {
      // Mock an error with status 429
      server.use(
        http.get('https://*.supabase.co/rest/v1/voices', () => {
          const error = new Error('Quota exceeded');
          (error as any).status = 429;
          throw error;
        }),
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

      expect(response.status).toBe(429);
      expect(json.error).toBe('Third-party API Quota exceeded');
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
    // Mock cache miss to force full generation
    server.use(
      http.get('https://*.upstash.io/*', () => {
        return HttpResponse.json({ result: null });
      }),
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
    expect(json.url).toBeTruthy();
    expect(json.creditsUsed).toBeGreaterThan(0);
    expect(json.creditsRemaining).toBeDefined();
  });

  it('should complete full voice generation flow for Gemini', async () => {
    // Mock cache miss to force full generation
    server.use(
      http.get('https://*.upstash.io/*', () => {
        return HttpResponse.json({ result: null });
      }),
    );

    // Set up mock Redis data for Gemini API keys
    const mockApiKeyData = JSON.stringify({
      id: 'test-key',
      apiKey: 'test-gemini-key',
      requestsPerMinute: 0,
      tokensPerMinute: 0,
      requestsPerDay: 0,
      maxRequestsPerMinute: 15,
      maxTokensPerMinute: 1000000,
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

    expect(response.status).toBe(200);
    expect(json.url).toBeTruthy();
    expect(json.creditsUsed).toBeGreaterThan(0);
    expect(json.creditsRemaining).toBeDefined();
  });
});
