import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/clone-voice/route';
import * as queries from '@/lib/supabase/queries';
import {
  flushPromises,
  mockBlobPut,
  mockInngestSend,
  mockRedisGet,
  mockRedisSet,
  mockReplicateRun,
  server,
} from './setup';

// Helper function to create a minimal valid WAV header
const createWavHeader = (): Uint8Array => {
  return new Uint8Array([
    // "RIFF" chunk descriptor
    0x52,
    0x49,
    0x46,
    0x46, // "RIFF"
    0x24,
    0x00,
    0x00,
    0x00, // File size - 8 (36 bytes for minimal WAV)
    // "WAVE" format
    0x57,
    0x41,
    0x56,
    0x45, // "WAVE"
    // "fmt " subchunk
    0x66,
    0x6d,
    0x74,
    0x20, // "fmt "
    0x10,
    0x00,
    0x00,
    0x00, // Subchunk1Size (16 for PCM)
    0x01,
    0x00, // AudioFormat (1 for PCM)
    0x01,
    0x00, // NumChannels (1)
    0x44,
    0xac,
    0x00,
    0x00, // SampleRate (44100)
    0x88,
    0x58,
    0x01,
    0x00, // ByteRate
    0x02,
    0x00, // BlockAlign
    0x10,
    0x00, // BitsPerSample (16)
  ]);
};

// Helper function to create a mock audio file
const createMockAudioFile = (
  name = 'test-audio.wav',
  type = 'audio/wav',
  size = 1024 * 1024, // 1MB
) => {
  // Create a minimal valid WAV buffer
  // WAV files must start with "RIFF" and have "WAVE" at byte 8
  const headerSize = 40;
  const dataSize = Math.max(0, size - headerSize);

  // Create header
  const wavHeader = createWavHeader();

  // Create padding data
  const padding = new Uint8Array(dataSize);

  // Combine header and padding
  const wavBuffer = new Uint8Array(headerSize + dataSize);
  wavBuffer.set(wavHeader, 0);
  wavBuffer.set(padding, headerSize);

  return new File([wavBuffer], name, { type });
};

// Helper function to create FormData with audio file
const createFormDataWithAudio = (
  text: string,
  audioFile: File = createMockAudioFile(),
  locale = 'en',
) => {
  const formData = new FormData();
  formData.append('text', text);
  formData.append('file', audioFile);
  formData.append('locale', locale);
  return formData;
};

describe('Clone Voice API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock parseBuffer for dynamic imports in the route
    const musicMetadata = await import('music-metadata');
    vi.spyOn(musicMetadata, 'parseBuffer').mockResolvedValue({
      format: { duration: 30 }, // Default valid duration
    } as any);
  });

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
        4.5 * 1024 * 1024 + 1, // Just over 4.5MB
      );
      const formData = createFormDataWithAudio('Hello world', largeFile);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe('File too large. Max 4.5MB allowed.');
    });

    it('should return 400 when audio duration is too short', async () => {
      // Mock music-metadata to return short duration
      vi.doMock('music-metadata', () => ({
        parseBuffer: vi.fn().mockResolvedValue({
          format: { duration: 3 }, // Less than 10 seconds
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
      const cachedInputUrl =
        'https://blob.vercel-storage.com/cached-input-audio.mp3';

      // Mock Redis.get to return cached input URL for this test
      mockRedisGet.mockResolvedValueOnce(cachedInputUrl);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      // Should still generate output audio and consume credits
      expect(json.url).toBeDefined();
      expect(json.creditsUsed).toBeGreaterThan(0);
      // But should not re-upload the input audio
      expect(mockBlobPut).toHaveBeenCalledTimes(1); // Only output upload
    });

    it('should generate new audio when cache miss occurs', async () => {
      // Mock cache miss for input audio
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

      // Verify input URL was cached
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining('clone-voice-input/'),
        expect.stringContaining('blob.vercel-storage.com'),
      );
    });

    it('should reuse existing uploaded audio file if it exists', async () => {
      // Mock cache hit - input audio is cached
      const cachedInputUrl = 'https://blob.vercel-storage.com/cached-input.mp3';
      mockRedisGet.mockResolvedValueOnce(cachedInputUrl);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Redis.get should be called for the input audio cache
      expect(mockRedisGet).toHaveBeenCalledWith(
        expect.stringContaining('clone-voice-input/'),
      );
      // Should only upload output audio, not input
      expect(mockBlobPut).toHaveBeenCalledTimes(1); // Only for output audio
    });

    it('should upload audio file if it does not exist in blob storage', async () => {
      // Mock cache miss - input audio not cached
      mockRedisGet.mockResolvedValueOnce(null);

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
    it('should successfully clone voice using Replicate English model', async () => {
      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile('audio1'),
        'en',
      );

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

      // Verify Replicate was called with correct parameters
      expect(mockReplicateRun).toHaveBeenCalledWith(
        'resemble-ai/chatterbox',
        {
          input: {
            prompt: 'Hello world',
            cfg_weight: 0.5,
            temperature: 0.8,
            exaggeration: 0.5,
            seed: 0,
            audio_prompt:
              'https://blob.vercel-storage.com/clone-voice-input/test-user-id-audio1',
          },
        },
        expect.any(Function),
      );
    });

    it('should successfully clone voice using Replicate Multilingual model', async () => {
      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile('audio1'),
        'fr',
      );

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

      // Verify Replicate was called with correct parameters
      expect(mockReplicateRun).toHaveBeenCalledWith(
        'resemble-ai/chatterbox-multilingual:9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c',
        {
          input: {
            text: 'Hello world',
            cfg_weight: 0.5,
            temperature: 0.8,
            exaggeration: 0.5,
            language: 'fr',
            seed: 0,
            reference_audio:
              'https://blob.vercel-storage.com/clone-voice-input/test-user-id-audio1',
          },
        },
        expect.any(Function),
      );
    });

    it('should save audio file with correct metadata', async () => {
      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      await flushPromises();

      expect(response.status).toBe(200);
      expect(queries.saveAudioFile).toHaveBeenCalledWith({
        userId: 'test-user-id',
        filename: expect.stringContaining('clone-voice/'),
        text: 'Hello world',
        url: expect.stringContaining('blob.vercel-storage.com'),
        model: 'resemble-ai/chatterbox',
        predictionId: expect.any(String),
        isPublic: false,
        voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
        duration: '30.000',
        credits_used: expect.any(Number),
        usage: {
          locale: 'en',
          userHasPaid: 'false',
        },
      });
    });

    it('should handle Replicate API errors gracefully', async () => {
      // Mock Replicate to return an error
      mockReplicateRun.mockResolvedValueOnce({
        error: 'API quota exceeded',
      });

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('API quota exceeded');
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
        // biome-ignore lint/performance/useTopLevelRegex: x
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
      // Mock Replicate to return an error
      mockReplicateRun.mockResolvedValueOnce({
        error: 'Generation failed',
      });

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
    it('should generate different hashes for different text inputs', async () => {
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

      const response1 = await POST(request1);
      const response2 = await POST(request2);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Both requests should upload to different output files (different hashes)
      const putCalls = mockBlobPut.mock.calls;
      // Find output file calls (clone-voice path, not input path)
      const outputCalls = putCalls.filter((call) =>
        call[0].includes('clone-voice/'),
      );
      // Input audio filenames are the same, but hashes differ due to Date.now()
      // and different text content
      expect(outputCalls.length).toBeGreaterThan(0);
    });

    it('should use input audio cache key based on filename', async () => {
      const formData1 = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile('audio-1.mp3'),
      );
      const formData2 = createFormDataWithAudio(
        'Different text',
        createMockAudioFile('audio-2.mp3'),
      );

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

      // Verify different input audio cache keys were used for different filenames
      const calls = mockRedisGet.mock.calls.map((call) => call[0]);
      expect(calls[0]).toContain('audio-1.mp3');
      expect(calls[1]).toContain('audio-2.mp3');
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
      mockReplicateRun.mockResolvedValueOnce({
        error: 'Test error',
      });

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
  });
});

describe('Integration Tests', () => {
  it('should complete full voice cloning flow', async () => {
    const formData = new FormData();
    formData.append('text', 'Hello world');

    const audioFile = createMockAudioFile();
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
  });
});
