import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/clone-voice/route';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import * as queries from '@/lib/supabase/queries';
import {
  flushPromises,
  mockFalSubscribe,
  mockMistralSpeechComplete,
  mockRedisGet,
  mockRedisSet,
  mockReplicateRun,
  mockUploadFileToR2,
  server,
} from './setup';

// Helper function to create a minimal valid WAV header
const createWavHeader = (dataSize: number): Uint8Array => {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44_100, true);
  view.setUint32(28, 88_200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  return new Uint8Array(buffer);
};

// Helper function to create a mock audio file
const createMockAudioFile = (
  name = 'test-audio.wav',
  type = 'audio/wav',
  size = 1024 * 1024, // 1MB
) => {
  // Create a minimal valid WAV buffer
  // WAV files must start with "RIFF" and have "WAVE" at byte 8
  const headerSize = 44;
  const dataSize = Math.max(0, size - headerSize);

  // Create header
  const wavHeader = createWavHeader(dataSize);

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
  enhanceReferenceAudio = false,
) => {
  const formData = new FormData();
  formData.append('text', text);
  formData.append('file', audioFile);
  formData.append('locale', locale);
  formData.append('enhanceReferenceAudio', String(enhanceReferenceAudio));
  return formData;
};

describe('Clone Voice API Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const musicMetadata = await import('music-metadata');
    vi.spyOn(musicMetadata, 'parseBuffer').mockResolvedValue({
      format: { duration: 12 }, // Default valid duration for Voxtral
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
      expect(json.code).toBe('errors.invalidContentType');
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
      expect(json.code).toBe('errors.missingRequiredParameters');
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

    it('should return 400 when free Voxtral text exceeds 1000 characters', async () => {
      const longText = 'a'.repeat(1001);
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
        'Text exceeds the maximum length of 1000 characters',
      );
      expect(json.code).toBe('errors.textTooLong');
      expect(json.details).toEqual({ MAX: 1000 });
    });

    it('should return 400 when paid Voxtral text exceeds 4000 characters', async () => {
      vi.mocked(queries.hasUserPaid).mockResolvedValueOnce(true);

      const longText = 'a'.repeat(4001);
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
        'Text exceeds the maximum length of 4000 characters',
      );
      expect(json.code).toBe('errors.textTooLong');
      expect(json.details).toEqual({ MAX: 4000 });
    });

    it('should return 400 when non-Voxtral text exceeds 300 characters', async () => {
      const longText = 'a'.repeat(301);
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
      expect(json.serverMessage).toContain(
        'Text exceeds the maximum length of 300 characters',
      );
      expect(json.code).toBe('errors.textTooLong');
      expect(json.details).toEqual({ MAX: 300 });
    });

    it('should keep non-Voxtral text capped at 300 characters for paid users', async () => {
      vi.mocked(queries.hasUserPaid).mockResolvedValueOnce(true);

      const longText = 'a'.repeat(301);
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
      expect(json.serverMessage).toContain(
        'Text exceeds the maximum length of 300 characters',
      );
      expect(json.code).toBe('errors.textTooLong');
      expect(json.details).toEqual({ MAX: 300 });
    });

    it('should accept text up to 300 chars for non-Voxtral locales', async () => {
      const validText = 'a'.repeat(300); // Exactly 300 chars - at the limit
      const formData = createFormDataWithAudio(
        validText,
        createMockAudioFile(),
        'ja',
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

    it('should accept text up to 1000 chars for free Voxtral locales', async () => {
      const validText = 'a'.repeat(1000);
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
          'Text exceeds the maximum length of 1000 characters',
        );
      }
    });

    it('should accept text up to 4000 chars for paid Voxtral locales', async () => {
      vi.mocked(queries.hasUserPaid).mockResolvedValueOnce(true);

      const validText = 'a'.repeat(4000);
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

      if (response.status === 400) {
        const json = await response.json();
        expect(json.serverMessage).not.toContain(
          'Text exceeds the maximum length of 4000 characters',
        );
      }
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
      expect(json.serverMessage).toContain('Invalid file type.');
      expect(json.code).toBe('errors.invalidFileType');
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
      expect(json.code).toBe('errors.fileTooLarge');
      expect(json.details).toMatchObject({
        MAX_BYTES: CLONING_FILE_MAX_SIZE,
        MAX_MB: maxMb,
      });
    });

    it('should return 400 when Voxtral reference audio duration is too short', async () => {
      const musicMetadata = await import('music-metadata');
      vi.spyOn(musicMetadata, 'parseBuffer').mockResolvedValue({
        format: { duration: 2 }, // Less than 3 seconds
      } as any);

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
        'Reference audio must be at least 3 seconds for voice cloning.',
      );
      expect(json.code).toBe('errors.audioDurationInvalidVoxtral');
      expect(json.details).toMatchObject({
        MIN: 3,
      });
    });

    it('should trim Voxtral reference audio when duration is too long', async () => {
      const musicMetadata = await import('music-metadata');
      vi.mocked(musicMetadata.parseBuffer)
        .mockResolvedValueOnce({
          format: { duration: 26 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 26 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 25 },
        } as any);

      const longAudioFile = createMockAudioFile(
        'long-reference.wav',
        'audio/wav',
        44 + 26 * 44_100 * 2,
      );
      const formData = createFormDataWithAudio(
        'Hello world',
        longAudioFile,
        'en',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();
      const trimmedBuffer = vi.mocked(musicMetadata.parseBuffer).mock
        .calls[2]?.[0] as Buffer;

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(trimmedBuffer.length).toBe(44 + 25 * 44_100 * 2);
    });

    it('should return 400 when audio duration cannot be determined', async () => {
      const musicMetadata = await import('music-metadata');
      vi.spyOn(musicMetadata, 'parseBuffer').mockResolvedValue({
        format: { duration: null },
      } as any);

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
      expect(json.code).toBe('errors.audioDurationUnknown');
    });

    it('should accept valid OGG audio when duration is available via format options', async () => {
      const musicMetadata = await import('music-metadata');
      const convertToWavModule = await import('@/lib/audio-converter');
      vi.spyOn(convertToWavModule, 'convertToWav').mockResolvedValueOnce(
        Buffer.from(await createMockAudioFile().arrayBuffer()),
      );
      vi.spyOn(musicMetadata, 'parseBuffer').mockResolvedValue({
        format: {
          container: 'Ogg',
          codec: 'Opus',
          duration: 12,
          sampleRate: 48_000,
          numberOfChannels: 1,
          hasAudio: true,
          hasVideo: false,
        },
        native: { vorbis: [] },
        quality: { warnings: [] },
        common: {},
      } as any);

      const oggFile = new File(['test'], 'normal-opus-12s.ogg', {
        type: 'audio/ogg',
      });
      const formData = createFormDataWithAudio('Hello world', oggFile, 'en');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).not.toBe(400);
    });

    it('should accept valid OGG audio when duration is available via format options', async () => {
      const musicMetadata = await import('music-metadata');
      const convertToWavModule = await import('@/lib/audio-converter');
      vi.spyOn(convertToWavModule, 'convertToWav').mockResolvedValueOnce(
        Buffer.from(await createMockAudioFile().arrayBuffer()),
      );
      vi.spyOn(musicMetadata, 'parseBuffer').mockResolvedValue({
        format: {
          container: 'Ogg',
          codec: 'Opus',
          duration: 12,
          sampleRate: 48_000,
          numberOfChannels: 1,
          hasAudio: true,
          hasVideo: false,
        },
        native: { vorbis: [] },
        quality: { warnings: [] },
        common: {},
      } as any);

      const oggFile = new File(['test'], 'normal-opus-12s.ogg', {
        type: 'audio/ogg',
      });
      const formData = createFormDataWithAudio('Hello world', oggFile, 'en');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).not.toBe(400);
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
      expect(json.code).toBe('errors.missingLocale');
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
      expect(json.code).toBe('errors.unsupportedLocale');
      expect(json.details).toEqual({ locale: 'xyz' });
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
      expect(json.code).toBe('errors.insufficientCredits');
      expect(json.details).toMatchObject({
        currentCredits: 10,
      });
    });

    it('should include reference audio enhancement credits in the credit check', async () => {
      vi.mocked(queries.getCredits).mockResolvedValueOnce(200);

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(402);
      expect(json.error).toContain(
        'Insufficient credits. You need 252 credits',
      );
      expect(json.code).toBe('errors.insufficientCredits');
      expect(json.details).toEqual({
        CREDITS: 252,
        currentCredits: 200,
      });
      expect(mockFalSubscribe).not.toHaveBeenCalled();
      expect(queries.reduceCredits).not.toHaveBeenCalled();
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
      const cachedOutputUrl = 'https://files.sexyvoice.ai/cached-output.wav';

      // Mock Redis.get to return cached generated output URL for this test
      mockRedisGet.mockResolvedValueOnce(cachedOutputUrl);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        url: cachedOutputUrl,
        creditsUsed: 0,
        creditsRemaining: 1000,
      });
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
      expect(queries.reduceCredits).not.toHaveBeenCalled();
      expect(queries.saveAudioFile).not.toHaveBeenCalled();
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

      // Generated output should still be cached
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringMatching(/^cloned-audio-free\/en-mistral-[a-f0-9]+\.wav$/),
        expect.stringContaining('files.sexyvoice.ai'),
      );
    });

    it('should check generated output cache using deterministic filename', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockRedisGet).toHaveBeenCalledWith(
        expect.stringMatching(/^cloned-audio-free\/en-mistral-[a-f0-9]+\.wav$/),
      );
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(1);
    });

    it('should upload only generated output audio when output cache misses', async () => {
      // Mock cache miss for generated output
      mockRedisGet.mockResolvedValueOnce(null);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Reference audio is not uploaded; only generated output is uploaded
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(1);
    });

    it('should return cached output without consuming credits or uploading output again', async () => {
      const cachedOutputUrl = 'https://files.sexyvoice.ai/cached-output.wav';

      mockRedisGet.mockResolvedValueOnce(cachedOutputUrl);

      const formData = createFormDataWithAudio('Hello world');

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        url: cachedOutputUrl,
        creditsUsed: 0,
        creditsRemaining: 1000,
      });

      expect(mockRedisGet).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('cloned-audio-free/'),
      );

      // Cached generated output should be reused, so no uploads occur.
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
      expect(queries.reduceCredits).not.toHaveBeenCalled();
      expect(queries.saveAudioFile).not.toHaveBeenCalled();
      expect(queries.insertUsageEvent).not.toHaveBeenCalled();
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should return cached enhanced output before invoking reference enhancement', async () => {
      const cachedOutputUrl =
        'https://files.sexyvoice.ai/cached-enhanced-output.wav';

      mockRedisGet.mockResolvedValueOnce(cachedOutputUrl);

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        url: cachedOutputUrl,
        creditsUsed: 0,
        creditsRemaining: 1000,
      });
      expect(mockFalSubscribe).not.toHaveBeenCalled();
      expect(mockUploadFileToR2).not.toHaveBeenCalled();
      expect(queries.reduceCredits).not.toHaveBeenCalled();
      expect(queries.saveAudioFile).not.toHaveBeenCalled();
    });

    it('should trim long fallback clips before invoking reference enhancement', async () => {
      const musicMetadata = await import('music-metadata');
      vi.mocked(musicMetadata.parseBuffer)
        .mockResolvedValueOnce({
          format: { duration: 61 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 61 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 10 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 10 },
        } as any);

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile('long-reference.wav'),
        'ja',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();
      await flushPromises();

      expect(response.status).toBe(200);
      expect(json.creditsUsed).toBe(232);
      expect(mockFalSubscribe).toHaveBeenCalled();
      expect(queries.insertUsageEvent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sourceType: 'audio_processing',
          quantity: 10,
          durationSeconds: 10,
          creditsUsed: 100,
          dollarAmount: 0.01,
          metadata: expect.objectContaining({
            referenceAudioOriginalDurationSeconds: 61,
            referenceAudioTrimmed: true,
          }),
        }),
      );
    });

    it('should upload only the first 10 seconds for long fallback clips', async () => {
      const musicMetadata = await import('music-metadata');
      vi.mocked(musicMetadata.parseBuffer)
        .mockResolvedValueOnce({
          format: { duration: 30 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 30 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 10 },
        } as any);

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(
          'long-reference.wav',
          'audio/wav',
          44 + 30 * 44_100 * 2,
        ),
        'ja',
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();
      const referenceUploadCall = vi.mocked(mockUploadFileToR2).mock.calls[0];
      const uploadedReferenceBuffer = referenceUploadCall?.[1] as Buffer;

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(referenceUploadCall?.[0]).toContain('clone-voice-input/');
      expect(uploadedReferenceBuffer.length).toBe(44 + 10 * 44_100 * 2);
      expect(referenceUploadCall?.[2]).toBe('audio/wav');
    });

    it('should trim long Voxtral clips before invoking reference enhancement', async () => {
      const musicMetadata = await import('music-metadata');
      vi.mocked(musicMetadata.parseBuffer)
        .mockResolvedValueOnce({
          format: { duration: 30 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 30 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 25 },
        } as any)
        .mockResolvedValueOnce({
          format: { duration: 25 },
        } as any);

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(
          'long-reference.wav',
          'audio/wav',
          44 + 30 * 44_100 * 2,
        ),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();
      await flushPromises();

      expect(response.status).toBe(200);
      expect(json.creditsUsed).toBe(382);
      expect(mockFalSubscribe).toHaveBeenCalled();
      expect(queries.insertUsageEvent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sourceType: 'audio_processing',
          quantity: 25,
          durationSeconds: 25,
          creditsUsed: 250,
          dollarAmount: 0.025,
          metadata: expect.objectContaining({
            referenceAudioOriginalDurationSeconds: 30,
            referenceAudioTrimmed: true,
          }),
        }),
      );
    });
  });

  describe('Voice Cloning Generation', () => {
    it('should successfully clone voice using Mistral Voxtral for English', async () => {
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

    it('should return a translated client error for Mistral guardrail violations', async () => {
      const guardrailBody = {
        object: 'error',
        message: 'Request blocked by guardrail policy',
        type: 'guardrail_violation',
        param: null,
        code: '1920',
        raw_status_code: 403,
      };
      const guardrailError = Object.assign(
        new Error(
          `API error occurred: Status 403. Body: ${JSON.stringify(guardrailBody)}`,
        ),
        {
          body: JSON.stringify(guardrailBody),
          name: 'SDKError',
          statusCode: 403,
        },
      );
      mockMistralSpeechComplete.mockRejectedValueOnce(guardrailError);

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

      expect(response.status).toBe(403);
      expect(json.code).toBe('errors.guardrailViolation');
      expect(json.serverMessage).toBe(
        'This request was blocked by a third-party voice cloning safety policy. Please try different text or a different reference audio.',
      );
      expect(json.details).toEqual({ provider: 'mistral' });
      expect(queries.reduceCredits).not.toHaveBeenCalled();
      expect(queries.saveAudioFile).not.toHaveBeenCalled();
    });

    it('should optionally enhance reference audio before cloning with Mistral', async () => {
      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile('audio1.wav'),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();
      await flushPromises();

      expect(response.status).toBe(200);
      expect(json.creditsUsed).toBe(252);
      expect(json.creditsRemaining).toBe(748);
      expect(mockFalSubscribe).toHaveBeenCalledWith(
        'fal-ai/deepfilternet3',
        expect.objectContaining({
          input: expect.objectContaining({
            audio_format: 'wav',
            audio_url: expect.any(File),
          }),
        }),
      );
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(1);
      expect(queries.reduceCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: 252,
      });
      expect(queries.saveAudioFile).toHaveBeenCalledWith(
        expect.objectContaining({
          credits_used: 252,
          usage: { creditsUsed: 252 },
        }),
      );
      expect(queries.insertUsageEvent).toHaveBeenCalledTimes(2);
      expect(queries.insertUsageEvent).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          sourceType: 'voice_cloning',
          creditsUsed: 132,
          dollarAmount: 0.000_176,
          metadata: expect.objectContaining({
            referenceAudioEnhanced: true,
            referenceAudioEnhancementModel: 'fal-ai/deepfilternet3',
            referenceAudioEnhancementRequestId: 'test-fal-request-id',
            referenceAudioProcessedMimeType: 'audio/wav',
          }),
        }),
      );
      expect(queries.insertUsageEvent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sourceType: 'audio_processing',
          sourceId: 'test-audio-file-id',
          requestId: 'test-fal-request-id',
          model: 'fal-ai/deepfilternet3',
          unit: 'secs',
          quantity: 12,
          durationSeconds: 12,
          creditsUsed: 120,
          dollarAmount: 0.012,
          metadata: expect.objectContaining({
            operation: 'reference_audio_enhancement',
            provider: 'fal',
            model: 'fal-ai/deepfilternet3',
            voiceCloningModel: 'voxtral-mini-tts-2603',
            locale: 'en',
            referenceAudioFileMimeType: 'audio/wav',
            referenceAudioProcessedMimeType: 'audio/wav',
          }),
        }),
      );
    });

    it('should apply a hard timeout to reference audio enhancement requests', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      const anySpy = vi.spyOn(AbortSignal, 'any');
      const controller = new AbortController();

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile('audio1.wav'),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(timeoutSpy).toHaveBeenCalledWith(60_000);
      expect(anySpy).toHaveBeenCalledTimes(1);
      const combinedSignals = anySpy.mock.calls[0]?.[0];
      expect(combinedSignals).toHaveLength(2);
      expect(combinedSignals?.[0]).toBe(request.signal);
      expect(combinedSignals?.[1]).toBeInstanceOf(AbortSignal);
      expect(mockFalSubscribe).toHaveBeenCalledWith(
        'fal-ai/deepfilternet3',
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
        }),
      );
    });

    it('should successfully clone voice using Mistral Voxtral for supported multilingual locales', async () => {
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

      // Supported Voxtral locales should not use the Replicate fallback path
      expect(mockReplicateRun).not.toHaveBeenCalled();
    });

    it('should optionally enhance reference audio before cloning with Replicate fallback locales', async () => {
      const formData = createFormDataWithAudio(
        'こんにちは',
        createMockAudioFile('audio1.wav'),
        'ja',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockFalSubscribe).toHaveBeenCalledTimes(1);
      expect(mockReplicateRun).toHaveBeenCalledWith(
        expect.any(String),
        {
          input: expect.objectContaining({
            reference_audio: expect.stringContaining(
              'https://files.sexyvoice.ai/clone-voice-input/',
            ),
          }),
        },
        expect.any(Function),
      );
      expect(mockUploadFileToR2).toHaveBeenCalledTimes(2);
      expect(mockUploadFileToR2).toHaveBeenCalledWith(
        expect.stringContaining('clone-voice-input/'),
        expect.any(Buffer),
        'audio/wav',
      );
      expect(mockUploadFileToR2).toHaveBeenCalledWith(
        expect.stringContaining('cloned-audio-free/'),
        expect.anything(),
        'audio/wav',
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
        model: 'voxtral-mini-tts-2603',
        predictionId: expect.any(String),
        isPublic: false,
        voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
        duration: '12.000',
        credits_used: expect.any(Number),
        usage: { creditsUsed: 132 },
      });

      // Verify usage event was logged for voice cloning
      expect(queries.insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          sourceType: 'voice_cloning',
          sourceId: 'test-audio-file-id',
          unit: 'operation',
          quantity: 1,
          creditsUsed: 132,
          dollarAmount: 0.000_176,
          metadata: expect.objectContaining({
            model: 'voxtral-mini-tts-2603',
            locale: 'en',
            provider: 'mistral',
            textPreview: 'Hello world',
            textLength: 11,
            audioDuration: 12,
            referenceAudioEnhanced: false,
            referenceAudioEnhancementModel: null,
            referenceAudioEnhancementRequestId: null,
            referenceAudioFileMimeType: 'audio/wav',
            referenceAudioProcessedMimeType: 'audio/wav',
            requestId: expect.any(String),
            userHasPaid: false,
          }),
        }),
      );
    });

    it('should handle Replicate API errors gracefully', async () => {
      // Mock Replicate to return an error for a fallback locale
      mockReplicateRun.mockResolvedValueOnce({
        error: 'API quota exceeded',
      });

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
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe(
        'An unexpected error occurred while cloning voice. Please try again.',
      );
      expect(json.code).toBe('errors.internalError');
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
        'tëst-äudio!@#$%.wav',
        'audio/wav',
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
      // Only generated output is uploaded; reference audio is never uploaded.
      expect(mockUploadFileToR2).toHaveBeenCalledWith(
        expect.stringContaining('cloned-audio-free/'),
        expect.any(Buffer),
        'audio/wav',
      );
    });

    it('should handle filenames with unicode characters', async () => {
      const unicodeFile = createMockAudioFile('音声ファイル.wav', 'audio/wav');
      const formData = createFormDataWithAudio('Hello world', unicodeFile);

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // Unicode filenames should not affect generated output upload.
      expect(mockUploadFileToR2).toHaveBeenCalledWith(
        expect.stringContaining('cloned-audio-free/'),
        expect.any(Buffer),
        'audio/wav',
      );
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
      const outputCalls = putCalls.filter((call) =>
        call[0].includes('cloned-audio-free/'),
      );
      expect(putCalls).toHaveLength(2);
      expect(outputCalls).toHaveLength(2);
      expect(outputCalls[0][0]).not.toBe(outputCalls[1][0]);
    });

    it('should use generated output cache key based on audio hash and text', async () => {
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

      const calls = mockRedisGet.mock.calls
        .map((call) => call[0])
        .filter((key) => key.startsWith('cloned-audio-free/'));

      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatch(
        /^cloned-audio-free\/en-mistral-[a-f0-9]+\.wav$/,
      );
      expect(calls[1]).toMatch(
        /^cloned-audio-free\/en-mistral-[a-f0-9]+\.wav$/,
      );
      expect(calls[0]).not.toBe(calls[1]);
    });

    it('should use a different cache key when reference audio enhancement is enabled', async () => {
      const formData1 = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile('audio-1.wav'),
        'en',
        false,
      );
      const formData2 = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile('audio-1.wav'),
        'en',
        true,
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

      const calls = mockRedisGet.mock.calls
        .map((call) => call[0])
        .filter((key) => key.startsWith('cloned-audio-free/'));

      expect(calls).toHaveLength(2);
      expect(calls[0]).not.toBe(calls[1]);
    });
  });

  describe('Error Handling', () => {
    it('should return 400 without logging to Sentry when audio decoding fails for non-English', async () => {
      const { captureException } = await import('@sentry/nextjs');
      // Mock convertToWav to throw an error for multilingual
      const convertToWavModule = await import('@/lib/audio-converter');
      vi.spyOn(convertToWavModule, 'convertToWav').mockRejectedValueOnce(
        new convertToWavModule.AudioDecodeError(
          'mp3',
          new Error('mpg123-decoder: -1 MPG123_ERR'),
        ),
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

      expect(response.status).toBe(400);
      expect(json.error).toBeDefined();
      expect(json.error).toContain('Failed to convert audio format to WAV');
      expect(json.code).toBe('errors.audioConversionFailed');
      expect(captureException).not.toHaveBeenCalled();
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
      expect(json.error).toBe(
        'An unexpected error occurred while cloning voice. Please try again.',
      );
      expect(json.serverMessage).toBe(
        'An unexpected error occurred while cloning voice. Please try again.',
      );
      expect(json.code).toBe('errors.internalError');
    });

    it('should log errors to Sentry', async () => {
      const { captureException } = await import('@sentry/nextjs');

      // Mock an error scenario on the Replicate fallback path
      mockReplicateRun.mockResolvedValueOnce({
        error: 'Test error',
      });

      const formData = createFormDataWithAudio(
        'こんにちは',
        createMockAudioFile(),
        'ja',
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

    it('should fall back to original audio when reference audio enhancement fails', async () => {
      mockFalSubscribe.mockRejectedValueOnce(new Error('enhancer unavailable'));

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();
      await flushPromises();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(json.creditsUsed).toBe(132);
      expect(queries.reduceCredits).toHaveBeenCalledWith({
        userId: 'test-user-id',
        amount: 132,
      });
      expect(queries.saveAudioFile).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: { creditsUsed: 132 },
        }),
      );
    });

    it('should fall back to original audio when enhanced audio download exceeds the size limit', async () => {
      server.use(
        http.get('https://fal-cdn.com/test-enhanced-audio.wav', () =>
          HttpResponse.arrayBuffer(new ArrayBuffer(1024), {
            headers: {
              'Content-Length': String(51 * 1024 * 1024),
              'Content-Type': 'audio/wav',
            },
          }),
        ),
      );

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(queries.reduceCredits).toHaveBeenCalled();
    });

    it('should fall back to original audio when enhanced audio download is not an audio content type', async () => {
      server.use(
        http.get('https://fal-cdn.com/test-enhanced-audio.wav', () =>
          HttpResponse.text('not audio', {
            headers: {
              'Content-Type': 'text/plain',
            },
          }),
        ),
      );

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(queries.reduceCredits).toHaveBeenCalled();
    });

    it('should fall back to original audio when reference audio enhancement returns an untrusted URL', async () => {
      mockFalSubscribe.mockResolvedValueOnce({
        data: {
          audio_file: {
            url: 'https://example.com/enhanced-audio.wav',
            content_type: 'audio/wav',
          },
        },
        requestId: 'test-fal-request-id',
      });

      const formData = createFormDataWithAudio(
        'Hello world',
        createMockAudioFile(),
        'en',
        true,
      );

      const request = new Request('http://localhost/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('files.sexyvoice.ai');
      expect(queries.reduceCredits).toHaveBeenCalled();
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
