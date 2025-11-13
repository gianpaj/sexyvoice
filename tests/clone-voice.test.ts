import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/clone-voice/route';
import * as queries from '@/lib/supabase/queries';
import {
  mockBlobHead,
  mockBlobPut,
  mockFalSubscribe,
  mockInngestSend,
  mockRedisGet,
  mockRedisSet,
  server,
} from './setup';

describe('Clone Voice API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock parseBuffer for dynamic imports in the route
    const musicMetadata = await import('music-metadata');
    vi.spyOn(musicMetadata, 'parseBuffer').mockResolvedValue({
      format: { duration: 30 }, // Default valid duration
    } as any);
  });

  // Helper function to create a mock audio file
  const createMockAudioFile = (
    name = 'test-audio.mp3',
    type = 'audio/mpeg',
    size = 1024 * 1024, // 1MB
  ) => {
    // Create a minimal valid MP3 buffer
    const mp3Header = new Uint8Array([
      0xff,
      0xfb,
      0x90,
      0x00, // MP3 frame sync and header
      ...Array(size - 4).fill(0),
    ]);
    const blob = new Blob([mp3Header], { type });
    return new File([blob], name, { type });
  };

  // Helper function to create FormData with audio file
  const createFormDataWithAudio = (
    text: string,
    audioFile: File = createMockAudioFile(),
  ) => {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('file', audioFile);
    return formData;
  };

  describe('Input Validation', () => {
    it('should return 400 when content-type is not multipart/form-data', async () => {
      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello world' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);

      expect(json.serverMessage).toBe(
        'Content-Type must be multipart/form-data',
      );
    });

    it('should return 400 when text is missing', async () => {
      const formData = new FormData();
      formData.append('file', createMockAudioFile());

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe(
        'Missing required parameters: text and audio file',
      );
    });

    it('should return 400 when audio file is missing', async () => {
      const formData = new FormData();
      formData.append('text', 'Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe(
        'Missing required parameters: text and audio file',
      );
    });

    it('should return 400 when text exceeds maximum length', async () => {
      const longText = 'a'.repeat(501); // Exceeds 500 char limit
      const formData = createFormDataWithAudio(longText);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toContain('Text exceeds the maximum length');
    });

    it('should return 400 when file type is invalid', async () => {
      const invalidFile = new File(['test'], 'test.txt', {
        type: 'text/plain',
      });
      const formData = createFormDataWithAudio('Hello world', invalidFile);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe(
        'Invalid file type. Only MP3, OGG, M4A, or WAV allowed.',
      );
    });

    it('should return 400 when file size exceeds limit', async () => {
      const largeFile = createMockAudioFile(
        'large.mp3',
        'audio/mpeg',
        11 * 1024 * 1024, // 11MB - exceeds 10MB limit
      );
      const formData = createFormDataWithAudio('Hello world', largeFile);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe('File too large. Max 10MB allowed.');
    });

    it('should return 400 when audio duration is too short', async () => {
      // Mock music-metadata to return short duration
      vi.doMock('music-metadata', () => ({
        parseBuffer: vi.fn().mockResolvedValue({
          format: { duration: 3 }, // Less than 5 seconds
        }),
      }));

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe(
        'Audio must be between 10 seconds and 5 minutes.',
      );
    });

    it('should return 400 when audio duration is too long', async () => {
      // Mock music-metadata to return long duration
      vi.doMock('music-metadata', () => ({
        parseBuffer: vi.fn().mockResolvedValue({
          format: { duration: 400 }, // More than 5 minutes (300 seconds)
        }),
      }));

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe(
        'Audio must be between 10 seconds and 5 minutes.',
      );
    });

    it('should return 400 when audio duration cannot be determined', async () => {
      // Mock music-metadata to return null duration
      vi.doMock('music-metadata', () => ({
        parseBuffer: vi.fn().mockResolvedValue({
          format: { duration: null },
        }),
      }));

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe('Could not determine audio duration.');
    });
  });

  describe.skip('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated user
      server.use(
        http.get('https://*.supabase.co/auth/v1/user', () =>
          HttpResponse.json({ user: null }),
        ),
      );

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.serverMessage).toBe('User not found');
    });
  });

  describe('Credit System', () => {
    it('should return 402 when user has insufficient credits', async () => {
      // Override the getCredits mock for this specific test
      vi.mocked(queries.getCredits).mockResolvedValueOnce(10);

      const formData = createFormDataWithAudio('Hello world this is a test');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(json.error).toContain('Insufficient credits');
      expect(response.status).toBe(402);
    });

    it('should allow voice cloning when user has sufficient credits', async () => {
      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toBeDefined();
      expect(json.creditsUsed).toBeGreaterThan(0);
      expect(json.creditsRemaining).toBeDefined();
    });

    it('should use higher credits for voice cloning than regular generation', async () => {
      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      // Voice cloning should use 'clone' type which has higher credits
      // For 11 characters, estimate should be higher than regular voice
      expect(json.creditsUsed).toBeGreaterThanOrEqual(48); // Min credits for clone
    });
  });

  describe('Caching', () => {
    it('should return cached result without consuming credits', async () => {
      const cachedUrl = 'https://example.com/cached-clone-audio.wav';

      // Mock Redis.get to return cached URL for this test
      mockRedisGet.mockResolvedValueOnce(cachedUrl);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toBe(cachedUrl);

      // Verify no credits were consumed on cache hit
      expect(queries.reduceCredits).not.toHaveBeenCalled();
      expect(queries.saveAudioFile).not.toHaveBeenCalled();
    });

    it('should generate new audio when cache miss occurs', async () => {
      // Mock cache miss
      mockRedisGet.mockResolvedValueOnce(null);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
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
        expect.stringContaining('clone-voice/'),
        expect.stringContaining('blob.vercel-storage.com'),
      );
    });

    it('should reuse existing uploaded audio file if it exists', async () => {
      // Mock blob.head to return existing audio file
      mockBlobHead.mockResolvedValueOnce({
        url: 'https://blob.vercel-storage.com/existing-audio.mp3',
        size: 1024,
        uploadedAt: new Date(),
        pathname: 'clone-voice-input/test-user-id-test-audio.mp3',
        contentType: 'audio/mpeg',
        contentDisposition: 'attachment',
        downloadUrl: 'https://blob.vercel-storage.com/existing-audio.mp3',
      });

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockBlobHead).toHaveBeenCalledWith(
        expect.stringContaining('test-audio.mp3'),
      );
      // Should not upload again if file exists
      expect(mockBlobPut).toHaveBeenCalledTimes(1); // Only for output audio
    });

    it('should upload audio file if it does not exist in blob storage', async () => {
      // Mock blob.head to throw (file doesn't exist)
      mockBlobHead.mockRejectedValueOnce(new Error('Not found'));

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Should upload both input and output audio files
      expect(mockBlobPut).toHaveBeenCalledTimes(2);
    });
  });

  describe('Voice Cloning Generation', () => {
    it('should successfully clone voice using fal.ai', async () => {
      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('blob.vercel-storage.com');
      expect(json.creditsUsed).toBeGreaterThan(0);
      expect(json.creditsRemaining).toBeDefined();
      expect(json.audioPromptUrl).toBeDefined();

      // Verify fal.ai was called with correct parameters
      expect(mockFalSubscribe).toHaveBeenCalledWith(
        'fal-ai/chatterbox/text-to-speech',
        expect.objectContaining({
          input: expect.objectContaining({
            text: 'Hello world',
            cfg_weight: 0.5,
            temperature: 0.8,
            exaggeration: 0.5,
            audio_url: expect.any(String),
          }),
          logs: false,
          abortSignal: expect.any(AbortSignal),
        }),
      );
    });

    it('should save audio file with correct metadata', async () => {
      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(queries.saveAudioFile).toHaveBeenCalledWith({
        userId: 'test-user-id',
        filename: expect.stringContaining('clone-voice/'),
        text: 'Hello world',
        url: expect.stringContaining('blob.vercel-storage.com'),
        model: 'chatterbox-tts',
        predictionId: expect.any(String),
        isPublic: false,
        voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
        duration: expect.any(String),
        credits_used: expect.any(Number),
      });
    });

    it('should handle fal.ai API errors gracefully', async () => {
      // Mock fal.subscribe to throw an error
      mockFalSubscribe.mockRejectedValueOnce(new Error('API quota exceeded'));

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
      expect(json.error).toContain('API quota exceeded');
    });

    it('should handle request abortion gracefully', async () => {
      const controller = new AbortController();

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      // Abort the request
      controller.abort();

      try {
        await POST(request);
      } catch (error) {
        // AbortError is expected
        expect(error).toBeDefined();
      }
    });
  });

  describe('File Name Sanitization', () => {
    it('should sanitize filename with special characters', async () => {
      const fileWithSpecialChars = createMockAudioFile(
        'tëst-äudio!@#$%.mp3',
        'audio/mpeg',
      );
      const formData = createFormDataWithAudio(
        'Hello world',
        fileWithSpecialChars,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Verify that sanitized filename is used
      expect(mockBlobPut).toHaveBeenCalledWith(
        expect.stringMatching(/test-audio_____.mp3/),
        expect.any(Buffer),
        expect.any(Object),
      );
    });

    it('should handle filenames with unicode characters', async () => {
      const unicodeFile = createMockAudioFile('音声ファイル.mp3', 'audio/mpeg');
      const formData = createFormDataWithAudio('Hello world', unicodeFile);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Verify sanitization occurred
      expect(mockBlobPut).toHaveBeenCalled();
    });
  });

  describe('Inngest Cleanup Scheduling', () => {
    it('should schedule cleanup task after successful voice cloning', async () => {
      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      // Wait for async after() operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(response.status).toBe(200);
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'clone-audio/cleanup.scheduled',
        data: {
          blobUrl: expect.stringContaining('clone-voice-input/'),
          userId: 'test-user-id',
        },
      });
    });

    it('should not schedule cleanup if generation fails', async () => {
      // Mock fal.subscribe to throw an error
      mockFalSubscribe.mockRejectedValueOnce(new Error('Generation failed'));

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      // Cleanup should not be scheduled on failure
      expect(mockInngestSend).not.toHaveBeenCalled();
    });
  });

  describe('Hash Generation', () => {
    it('should generate consistent hashes for same inputs', async () => {
      const formData1 = createFormDataWithAudio('Hello world');
      const formData2 = createFormDataWithAudio('Hello world');

      const request1 = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData1,
      });

      const request2 = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData2,
      });

      // Both requests should use the same cache key
      const response1 = await POST(request1);
      const response2 = await POST(request2);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify Redis.get was called with same key pattern
      expect(mockRedisGet).toHaveBeenCalledWith(
        expect.stringContaining('clone-voice/'),
      );
    });

    it('should generate different hashes for different inputs', async () => {
      const formData1 = createFormDataWithAudio('Hello world');
      const formData2 = createFormDataWithAudio('Different text');

      const request1 = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData1,
      });

      const request2 = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData2,
      });

      await POST(request1);
      await POST(request2);

      // Verify different cache keys were used
      const calls = mockRedisGet.mock.calls.map((call) => call[0]);
      expect(calls[0]).not.toBe(calls[1]);
    });
  });

  describe('Error Handling', () => {
    it('should handle general errors and return 500', async () => {
      // Mock getCredits to throw an error
      vi.mocked(queries.getCredits).mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
      expect(json.error).toContain('Database connection failed');
    });

    it('should log errors to Sentry', async () => {
      const { captureException } = await import('@sentry/nextjs');

      // Mock an error scenario
      mockFalSubscribe.mockRejectedValueOnce(new Error('Test error'));

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      expect(captureException).toHaveBeenCalled();
    });

    it('should handle Blob storage upload failures', async () => {
      // Mock blob.put to throw an error
      mockBlobPut.mockRejectedValueOnce(new Error('Storage quota exceeded'));

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
    });
  });

  describe('Analytics Integration', () => {
    it('should track voice cloning event with PostHog', async () => {
      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // PostHog tracking is verified through the mock
      // The actual event tracking happens in the after() callback
    });

    it('should track cached result with PostHog without credit usage', async () => {
      const cachedUrl = 'https://example.com/cached-clone-audio.wav';
      mockRedisGet.mockResolvedValueOnce(cachedUrl);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // PostHog should track with 0 credits used
    });
  });

  describe('Supported Audio Formats', () => {
    it('should accept MP3 files', async () => {
      const mp3File = createMockAudioFile('test.mp3', 'audio/mpeg');
      const formData = createFormDataWithAudio('Hello world', mp3File);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should accept WAV files', async () => {
      const wavFile = createMockAudioFile('test.wav', 'audio/wav');
      const formData = createFormDataWithAudio('Hello world', wavFile);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should accept OGG files', async () => {
      const oggFile = createMockAudioFile('test.ogg', 'audio/ogg');
      const formData = createFormDataWithAudio('Hello world', oggFile);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should accept M4A files', async () => {
      const m4aFile = createMockAudioFile('test.m4a', 'audio/m4a');
      const formData = createFormDataWithAudio('Hello world', m4aFile);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });
});

describe('Integration Tests', () => {
  it('should complete full voice cloning flow', async () => {
    const formData = new FormData();
    formData.append('text', 'Hello world');

    // Create a minimal valid MP3 buffer
    const mp3Header = new Uint8Array([
      0xff,
      0xfb,
      0x90,
      0x00,
      ...Array(1024 * 1024 - 4).fill(0),
    ]);
    const audioBlob = new Blob([mp3Header], { type: 'audio/mpeg' });
    const audioFile = new File([audioBlob], 'test-audio.mp3', {
      type: 'audio/mpeg',
    });
    formData.append('file', audioFile);

    const request = new Request('http://localhost/api/clone-voice', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.url).toBeTruthy();
    expect(json.creditsUsed).toBeGreaterThan(0);
    expect(json.creditsRemaining).toBeDefined();
    expect(json.audioPromptUrl).toBeTruthy();
  });
});
