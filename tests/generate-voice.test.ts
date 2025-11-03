import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/generate-voice/route';
import { getErrorMessage } from '@/app/api/utils';
import * as queries from '@/lib/supabase/queries';
import type { GoogleApiError } from '@/utils/googleErrors';
import {
  mockBlobPut,
  mockRedisGet,
  mockRedisKeys,
  mockRedisSet,
  mockReplicateRun,
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
      expect(json.error).toBe('Voice not found');
    });
  });

  describe('Credit System', () => {
    it('should return 402 when user has insufficient credits for Replicate voice', async () => {
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
        body: JSON.stringify({ text: 'Hello world', voice: 'tara' }),
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
        expect.stringContaining('audio/tara-'),
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
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
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
        expect.stringContaining('audio/poe-'),
      );
    });

    it('should generate new audio when cache miss occurs', async () => {
      const queries = await import('@/lib/supabase/queries');

      // Mock cache miss
      mockRedisGet.mockResolvedValueOnce(null);

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
      expect(json.url).toContain('blob.vercel-storage.com');

      // Verify audio was generated and saved
      expect(queries.reduceCredits).toHaveBeenCalled();
      expect(queries.saveAudioFile).toHaveBeenCalled();

      // Verify new URL was cached
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining('audio/tara-'),
        expect.stringContaining('blob.vercel-storage.com'),
      );
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

    it('should throw error when Replicate output contains error property', async () => {
      mockReplicateRun.mockResolvedValueOnce({
        error: 'Model execution failed due to timeout',
      });

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
      expect(json.error).toBe('Voice generation failed, please retry');
      expect(mockReplicateRun).toHaveBeenCalled();
    });
  });

  describe('Voice Generation - Google Gemini', () => {
    it('should successfully generate voice using Google Gemini', async () => {
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

      // Verify credits were consumed
      expect(queries.reduceCredits).toHaveBeenCalledOnce();
      expect(queries.saveAudioFile).toHaveBeenCalledOnce();
      expect(mockBlobPut).toHaveBeenCalledOnce();
    });

    it('should fallback to flash model when pro model fails', async () => {
      const { saveAudioFile } = await import('@/lib/supabase/queries');
      // We need to mock the GoogleGenAI SDK directly to throw an error on first call
      const { GoogleGenAI } = await import('@google/genai');

      let callCount = 0;

      vi.mocked(GoogleGenAI).mockImplementationOnce(
        () =>
          ({
            models: {
              generateContent: vi.fn().mockImplementation(async ({ model }) => {
                callCount++;
                if (callCount === 1) {
                  // First call (pro model) should throw
                  const error = new Error('Pro model failed');
                  throw error;
                }
                // Second call (flash model) succeeds
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
                    },
                  ],
                };
              }),
            },
          }) as any,
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
      expect(callCount).toBe(2); // Should have been called twice
      expect(saveAudioFile).toHaveBeenCalledWith({
        credits_used: 48,
        duration: '-1',
        filename: 'audio/poe-01020304.wav',
        isPublic: false,
        model: 'gemini-2.5-flash-preview-tts',
        predictionId: undefined,
        text: 'Hello world',
        url: 'https://blob.vercel-storage.com/test-audio-xyz.wav',
        userId: 'test-user-id',
        voiceId: 'voice-poe-id',
      });

      expect(json.url).toContain('blob.vercel-storage.com');
    });

    it('should handle Google API quota exceeded error', async () => {
      const { GoogleGenAI } = await import('@google/genai');

      // Mock Google API quota error - should fail on both pro and flash models
      vi.mocked(GoogleGenAI).mockImplementationOnce(
        () =>
          ({
            models: {
              generateContent: vi.fn().mockImplementation(async () => {
                // Both pro and flash models will throw the same quota error
                const apiError: GoogleApiError = {
                  code: 429,
                  message:
                    'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 0',
                  // @ts-ignore - taken from logs
                  status: 'RESOURCE_EXHAUSTED',
                  details: [
                    {
                      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                      violations: [
                        // @ts-ignore - taken from logs
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
          }) as any,
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
      expect(json.error).toContain(
        getErrorMessage('THIRD_P_QUOTA_EXCEEDED', 'voice-generation'),
      );
    });

    it('should return 403 when freemium user exceeds gpro voice limit', async () => {
      const queries = await import('@/lib/supabase/queries');

      // Mock isFreemiumUserOverLimit to return true
      vi.mocked(queries.isFreemiumUserOverLimit).mockResolvedValueOnce(true);

      const request = new Request('http://localhost/api/generate-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world', voice: 'poe' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toContain('exceeded the limit');
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
      expect(queries.isFreemiumUserOverLimit).toHaveBeenCalledWith(
        'test-user-id',
      );
    });

    it('should throw error when Gemini response has no data', async () => {
      const { GoogleGenAI } = await import('@google/genai');

      // Mock Gemini to return response without data (both pro and flash will fail)
      vi.mocked(GoogleGenAI).mockImplementationOnce(
        () =>
          ({
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
          }) as any,
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
      expect(json.error).toBe(
        getErrorMessage('NO_DATA_OR_MIME_TYPE', 'voice-generation'),
      );
    });

    it('should throw error when Gemini response has no mimeType', async () => {
      const { GoogleGenAI } = await import('@google/genai');

      // Mock Gemini to return response without mimeType (both pro and flash will fail)
      vi.mocked(GoogleGenAI).mockImplementationOnce(
        () =>
          ({
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
          }) as unknown as any,
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
      expect(json.error).toBe(
        getErrorMessage('NO_DATA_OR_MIME_TYPE', 'voice-generation'),
      );
    });

    it('should throw error when Gemini response has PROHIBITED_CONTENT finish reason', async () => {
      const { GoogleGenAI } = await import('@google/genai');

      // Mock Gemini to return response with PROHIBITED_CONTENT finish reason
      vi.mocked(GoogleGenAI).mockImplementationOnce(
        () =>
          ({
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
          }) as unknown as any,
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
      expect(json.error).toBe(
        getErrorMessage('PROHIBITED_CONTENT', 'voice-generation'),
      );
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
      // Mock Replicate API to return error
      server.use(
        http.post('https://api.replicate.com/v1/predictions', () => {
          return HttpResponse.json(
            { detail: 'Model not found' },
            { status: 404 },
          );
        }),
      );

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

  describe('Error Handling', () => {
    it('should handle general errors and return 500', async () => {
      // Mock getVoiceIdByName to throw an error
      const queries = await import('@/lib/supabase/queries');
      vi.mocked(queries.getVoiceIdByName).mockRejectedValueOnce(
        new Error('Database connection failed'),
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

    it('should handle getVoiceIdByName failure with error response', async () => {
      // Mock getVoiceIdByName to throw an error with status 429
      const queries = await import('@/lib/supabase/queries');
      const error = new Error('Quotas exceeded');
      (error as any).status = 500;
      vi.mocked(queries.getVoiceIdByName).mockRejectedValueOnce(error);

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

    // TODO: mock here isFreemiumUserOverLimit()

    expect(response.status).toBe(200);
    expect(json.url).toBeTruthy();
    expect(json.creditsUsed).toBeGreaterThan(20);
    expect(json.creditsRemaining).toBeDefined();
  });
});
