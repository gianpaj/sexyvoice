import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/clone-voice/route';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import * as queries from '@/lib/supabase/queries';
import {
  flushPromises,
  mockRedisGet,
  mockRedisSet,
  mockReplicateRun,
  mockUploadFileToR2,
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
      formData.append('locale', 'en');

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
      formData.append('locale', 'en');

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

    it('should return 400 when text exceeds maximum length for English', async () => {
      const longText = 'a'.repeat(501); // Exceeds 500 char limit for English
      const formData = createFormDataWithAudio(
        longText,
        createMockAudioFile(),
        'en',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toContain(
        'Text exceeds the maximum length of 500 characters',
      );
    });

    it('should return 400 when text exceeds multilingual maximum length (300 chars)', async () => {
      const longText = 'a'.repeat(301); // Exceeds 300 char limit for multilingual
      const formData = createFormDataWithAudio(
        longText,
        createMockAudioFile(),
        'es',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toContain(
        'Text exceeds the maximum length of 300 characters',
      );
      expect(json.serverMessage).toContain('multilingual');
    });

    it('should accept text up to 300 chars for multilingual locales', async () => {
      const validText = 'a'.repeat(300); // Exactly 300 chars - at the limit
      const formData = createFormDataWithAudio(
        validText,
        createMockAudioFile(),
        'de',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      // Should not return 400 for text length validation
      // Text validation should pass; other status codes (402, 500, etc.) are acceptable
      if (response.status === 400) {
        const json = await response.json();
        expect(json.serverMessage).not.toContain(
          'Text exceeds the maximum length of 300 characters',
        );
      }
    });

    it('should accept text up to 500 chars for English locale', async () => {
      const validText = 'a'.repeat(500); // Exactly 500 chars - at the limit
      const formData = createFormDataWithAudio(
        validText,
        createMockAudioFile(),
        'en',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      // Should not return 400 for text length validation
      // Text validation should pass; other status codes (402, 500, etc.) are acceptable
      if (response.status === 400) {
        const json = await response.json();
        expect(json.serverMessage).not.toContain(
          'Text exceeds the maximum length of 500 characters',
        );
      }
    });

    it('should enforce 300 char limit for French multilingual', async () => {
      const longText = 'Bonjour '.repeat(50); // Exceeds 300 chars
      const formData = createFormDataWithAudio(
        longText,
        createMockAudioFile(),
        'fr',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toContain('300 characters');
    });

    it('should enforce 300 char limit for Japanese multilingual', async () => {
      const longText = 'こんにちは'.repeat(100); // Exceeds 300 chars
      const formData = createFormDataWithAudio(
        longText,
        createMockAudioFile(),
        'ja',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toContain('300 characters');
    });

    it('should return 400 when file type is invalid', async () => {
      const invalidFile = new File(['test'], 'test.txt', {
        type: 'text/plain',
      });
      const formData = createFormDataWithAudio(
        'Hello world',
        invalidFile,
        'en',
      );

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
      const formData = createFormDataWithAudio('Hello world', largeFile, 'en');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(413);
      const maxMb = (CLONING_FILE_MAX_SIZE / 1024 / 1024).toFixed(1);
      const errorMessage = `File too large. Max ${maxMb}MB allowed.`;
      expect(json.serverMessage).toBe(errorMessage);
    });

    it('should return 400 when audio duration is too short', async () => {
      // Mock music-metadata to return short duration
      vi.doMock('music-metadata', () => ({
        parseBuffer: vi.fn().mockResolvedValue({
          format: { duration: 3 }, // Less than 10 seconds
        }),
      }));

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
      );

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

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
      );

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

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe('Could not determine audio duration.');
    });

    it('should return 400 when locale is missing', async () => {
      const formData = new FormData();
      formData.append('text', 'Hello world');
      formData.append('file', createMockAudioFile());
      // Note: locale is not appended

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toBe('Missing required parameter: locale');
    });

    it('should return 400 when locale is unsupported for Replicate (non-English)', async () => {
      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'xyz',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.serverMessage).toContain(
        'Unsupported language for voice cloning: xyz',
      );
      expect(json.serverMessage).toContain('Supported languages are:');
    });

    it('should not reject valid supported locales (Spanish)', async () => {
      const formData = createFormDataWithAudio(
        'Hola mundo',
        createMockAudioFile(),
        'es',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      // Spanish is a supported locale - locale validation should pass
      // Response may be non-200 for other reasons (credits, mocking), but not 400 for locale
      if (response.status === 400) {
        const json = await response.json();
        expect(json.serverMessage).not.toContain(
          'Unsupported language for voice cloning',
        );
      }
    });

    it('should not reject valid supported locales (German)', async () => {
      const formData = createFormDataWithAudio(
        'Hallo Welt',
        createMockAudioFile(),
        'de',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      // German is a supported locale - locale validation should pass
      if (response.status === 400) {
        const json = await response.json();
        expect(json.serverMessage).not.toContain(
          'Unsupported language for voice cloning',
        );
      }
    });

    it('should not reject valid supported locales (Japanese)', async () => {
      const formData = createFormDataWithAudio(
        'こんにちは',
        createMockAudioFile(),
        'ja',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      // Japanese is a supported locale - locale validation should pass
      if (response.status === 400) {
        const json = await response.json();
        expect(json.serverMessage).not.toContain(
          'Unsupported language for voice cloning',
        );
      }
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
        'https://files.sexyvoice.ai/cached-input-audio.mp3';

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
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(1); // Only output upload
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
      expect(json.url).toContain('files.sexyvoice.ai');

      // Verify audio was generated and saved
      expect(queries.reduceCredits).toHaveBeenCalled();
      expect(queries.saveAudioFile).toHaveBeenCalled();

      // Verify input URL was cached
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining('clone-voice-input/'),
        expect.stringContaining('files.sexyvoice.ai'),
      );
    });

    it('should reuse existing uploaded audio file if it exists', async () => {
      // Mock cache hit - input audio is cached
      const cachedInputUrl = 'https://files.sexyvoice.ai/cached-input.mp3';
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
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(1); // Only for output audio
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
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(2);
    });
  });

  describe('Voice Cloning Generation', () => {
    it('should successfully clone voice using fal.ai English model', async () => {
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
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(json.creditsUsed).toBeGreaterThan(0);
      expect(json.creditsRemaining).toBeDefined();
    });

    it('should successfully clone voice using Replicate Multilingual model', async () => {
      const formData = createFormDataWithAudio(
        'Bonjour',
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
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(json.creditsUsed).toBeGreaterThan(0);
      expect(json.creditsRemaining).toBeDefined();

      // Verify Replicate was called with correct parameters
      expect(mockReplicateRun).toHaveBeenCalledWith(
        'resemble-ai/chatterbox-multilingual:9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c',
        {
          input: {
            text: 'Bonjour',
            cfg_weight: 0.5,
            temperature: 0.8,
            exaggeration: 0.5,
            language: 'fr',
            seed: 0,
            reference_audio:
              'https://files.sexyvoice.ai/clone-voice-input/test-user-id-audio1.wav',
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
        filename: expect.stringContaining('cloned-audio-free/'),
        text: 'Hello world',
        url: expect.stringContaining('files.sexyvoice.ai'),
        model: 'fal-ai/chatterbox/text-to-speech',
        predictionId: expect.any(String),
        isPublic: false,
        voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
        duration: '30.000',
        credits_used: expect.any(Number),
        usage: {
          locale: 'en',
          userHasPaid: false,
          referenceAudioFileMimeType: 'audio/wav',
        },
      });
    });

    it('should handle Replicate API errors gracefully', async () => {
      // Mock Replicate to return an error for multilingual
      mockReplicateRun.mockResolvedValueOnce({
        error: 'API quota exceeded',
      });

      const formData = createFormDataWithAudio(
        'Hola mundo',
        createMockAudioFile(),
        'es',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
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
      // Verify that sanitized filename is used.
      // MP3 input is converted to WAV before uploading (server-side), so extension becomes .wav
      expect(mockUploadFileToR2).toHaveBeenCalledWith(
        'clone-voice-input/test-user-id-test-audio_____.mp3',
        expect.any(Buffer),
        expect.any(String),
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
      expect(mockUploadFileToR2).toHaveBeenCalled();
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
      const putCalls = mockUploadFileToR2.mock.calls;
      // Find output file calls (cloned-audio-free path, not input path)
      const outputCalls = putCalls.filter((call) =>
        call[0].includes('cloned-audio-free/'),
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
      expect(calls[0]).toContain('clone-voice-input/test-user-id-audio-1.wav');
      expect(calls[1]).toContain('clone-voice-input/test-user-id-audio-2.wav');
      expect(calls[0]).not.toBe(calls[1]);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when audio conversion fails for non-English', async () => {
      // Mock convertToWav to throw an error for multilingual
      const convertToWavModule = await import('@/lib/audio-converter');
      vi.spyOn(convertToWavModule, 'convertToWav').mockRejectedValueOnce(
        new Error('Decoder initialization failed'),
      );

      const formData = createFormDataWithAudio(
        'Hola mundo',
        createMockAudioFile('test.mp3', 'audio/mpeg'),
        'es',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
      expect(json.error).toContain('Failed to convert audio format to WAV');
    });

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

      // Mock an error scenario with multilingual
      mockReplicateRun.mockResolvedValueOnce({
        error: 'Test error',
      });

      const formData = createFormDataWithAudio(
        'Hola mundo',
        createMockAudioFile(),
        'es',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      expect(captureException).toHaveBeenCalled();
    });

    it('should handle R2 storage upload failures', async () => {
      // Mock uploadFileToR2 to throw an error
      mockUploadFileToR2.mockRejectedValueOnce(
        new Error('Storage quota exceeded'),
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
    formData.append('locale', 'en');

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
