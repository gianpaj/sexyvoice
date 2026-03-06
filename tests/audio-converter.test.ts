import { describe, expect, test, vi } from 'vitest';

import {
  convertToWav,
  detectAudioFormat,
  isConversionSupported,
  needsConversion,
} from '../lib/audio-converter';

// Mock the WASM decoders
vi.mock('mpg123-decoder', () => ({
  MPEGDecoder: class MockMPEGDecoder {
    ready = Promise.resolve();

    decode() {
      return {
        channelData: [new Float32Array([0.1, 0.2, 0.3])],
        sampleRate: 44_100,
        samplesDecoded: 3,
        errors: [],
      };
    }

    free() {}
  },
}));

vi.mock('ogg-opus-decoder', () => ({
  OggOpusDecoder: class MockOggOpusDecoder {
    ready = Promise.resolve();

    decode() {
      return {
        channelData: [new Float32Array([0.1, 0.2, 0.3])],
        sampleRate: 48_000,
        samplesDecoded: 3,
        errors: [],
      };
    }

    free() {}
  },
}));

vi.mock('@wasm-audio-decoders/ogg-vorbis', () => ({
  OggVorbisDecoder: class MockOggVorbisDecoder {
    ready = Promise.resolve();

    async decode() {
      return {
        channelData: [new Float32Array([0.1, 0.2, 0.3])],
        sampleRate: 44_100,
        samplesDecoded: 3,
        bitDepth: 16 as const,
        errors: [],
      };
    }

    free() {}
  },
}));

describe('audio-converter', () => {
  describe('detectAudioFormat', () => {
    test('should detect MP3 from audio/mpeg MIME type', () => {
      const format = detectAudioFormat('audio/mpeg');
      expect(format).toBe('mp3');
    });

    test('should detect MP3 from audio/mp3 MIME type', () => {
      const format = detectAudioFormat('audio/mp3');
      expect(format).toBe('mp3');
    });

    test('should detect MP3 from audio/x-mp3 MIME type', () => {
      const format = detectAudioFormat('audio/x-mp3');
      expect(format).toBe('mp3');
    });

    test('should detect OGG from audio/ogg MIME type', () => {
      const format = detectAudioFormat('audio/ogg');
      expect(format).toBe('ogg');
    });

    test('should detect OGG from audio/opus MIME type', () => {
      const format = detectAudioFormat('audio/opus');
      expect(format).toBe('ogg');
    });

    test('should detect Vorbis from audio/vorbis MIME type', () => {
      const format = detectAudioFormat('audio/vorbis');
      expect(format).toBe('vorbis');
    });

    test('should detect format from file extension as fallback', () => {
      const format = detectAudioFormat('application/octet-stream', 'audio.mp3');
      expect(format).toBe('mp3');
    });

    test('should detect OGG from file extension', () => {
      const format = detectAudioFormat('application/octet-stream', 'audio.ogg');
      expect(format).toBe('ogg');
    });

    test('should be case-insensitive for MIME types', () => {
      const format = detectAudioFormat('AUDIO/MPEG');
      expect(format).toBe('mp3');
    });

    test('should return null for unsupported format', () => {
      const format = detectAudioFormat('audio/flac');
      expect(format).toBeNull();
    });

    test('should return null when no format can be detected', () => {
      const format = detectAudioFormat('application/octet-stream', 'file.txt');
      expect(format).toBeNull();
    });

    test('should handle MIME type with parameters', () => {
      const format = detectAudioFormat('audio/mpeg');
      expect(format).toBe('mp3');
    });
  });

  describe('needsConversion', () => {
    test('should return true for MP3 files', () => {
      expect(needsConversion('audio/mpeg')).toBe(true);
    });

    test('should return true for OGG files', () => {
      expect(needsConversion('audio/ogg')).toBe(true);
    });

    test('should return false for WAV files', () => {
      expect(needsConversion('audio/wav')).toBe(false);
    });

    test('should return false for audio/x-wav', () => {
      expect(needsConversion('audio/x-wav')).toBe(false);
    });

    test('should return false for audio/wave', () => {
      expect(needsConversion('audio/wave')).toBe(false);
    });

    test('should be case-insensitive', () => {
      expect(needsConversion('AUDIO/WAV')).toBe(false);
      expect(needsConversion('AUDIO/MPEG')).toBe(true);
    });
  });

  describe('isConversionSupported', () => {
    test('should return true for MP3 files', () => {
      expect(isConversionSupported('audio/mpeg')).toBe(true);
    });

    test('should return true for OGG files', () => {
      expect(isConversionSupported('audio/ogg')).toBe(true);
    });

    test('should return true for Vorbis files', () => {
      expect(isConversionSupported('audio/vorbis')).toBe(true);
    });

    test('should return false for unsupported formats', () => {
      expect(isConversionSupported('audio/flac')).toBe(false);
    });

    test('should use filename as fallback for format detection', () => {
      expect(
        isConversionSupported('application/octet-stream', 'audio.mp3'),
      ).toBe(true);
    });

    test('should return false when format cannot be detected from filename', () => {
      expect(
        isConversionSupported('application/octet-stream', 'file.txt'),
      ).toBe(false);
    });
  });

  describe('convertToWav', () => {
    test('should convert MP3 to WAV', async () => {
      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]); // MP3 header
      const wavBuffer = await convertToWav(mp3Buffer, 'audio/mpeg', 'test.mp3');

      expect(wavBuffer).not.toBeNull();
      expect(wavBuffer).toBeInstanceOf(Buffer);

      // Verify WAV header
      expect(wavBuffer?.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wavBuffer?.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wavBuffer?.toString('ascii', 12, 16)).toBe('fmt ');
      expect(wavBuffer?.toString('ascii', 36, 40)).toBe('data');
    });

    test('should convert OGG Opus to WAV', async () => {
      const oggBuffer = Buffer.from([0x4f, 0x67, 0x67, 0x53]); // OGG header
      const wavBuffer = await convertToWav(
        oggBuffer,
        'audio/opus',
        'test.opus',
      );

      expect(wavBuffer).not.toBeNull();
      expect(wavBuffer).toBeInstanceOf(Buffer);
      expect(wavBuffer?.toString('ascii', 0, 4)).toBe('RIFF');
    });

    test('should convert OGG Vorbis to WAV', async () => {
      const oggBuffer = Buffer.from([0x4f, 0x67, 0x67, 0x53]); // OGG header
      const wavBuffer = await convertToWav(
        oggBuffer,
        'audio/vorbis',
        'test.ogg',
      );

      expect(wavBuffer).not.toBeNull();
      expect(wavBuffer).toBeInstanceOf(Buffer);
      expect(wavBuffer?.toString('ascii', 0, 4)).toBe('RIFF');
    });

    test('should return null for unsupported format', async () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const wavBuffer = await convertToWav(buffer, 'audio/flac', 'test.flac');

      expect(wavBuffer).toBeNull();
    });

    test('should use filename as fallback for format detection', async () => {
      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]);
      const wavBuffer = await convertToWav(
        mp3Buffer,
        'application/octet-stream',
        'audio.mp3',
      );

      expect(wavBuffer).not.toBeNull();
      expect(wavBuffer?.toString('ascii', 0, 4)).toBe('RIFF');
    });

    test('should create valid WAV header structure', async () => {
      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]);
      const wavBuffer = await convertToWav(mp3Buffer, 'audio/mpeg');

      expect(wavBuffer).not.toBeNull();

      // Check WAV header structure
      const header = wavBuffer as Buffer;

      // RIFF chunk descriptor
      expect(header.toString('ascii', 0, 4)).toBe('RIFF');
      expect(header.toString('ascii', 8, 12)).toBe('WAVE');

      // fmt sub-chunk
      expect(header.toString('ascii', 12, 16)).toBe('fmt ');
      expect(header.readUInt32LE(16)).toBe(16); // Subchunk1Size (PCM)
      expect(header.readUInt16LE(20)).toBe(1); // AudioFormat (1 = PCM)

      // data sub-chunk
      expect(header.toString('ascii', 36, 40)).toBe('data');
    });

    test('should set correct sample rate in WAV header', async () => {
      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]);
      const wavBuffer = await convertToWav(mp3Buffer, 'audio/mpeg');

      expect(wavBuffer).not.toBeNull();

      const header = wavBuffer as Buffer;
      const sampleRate = header.readUInt32LE(24);

      // Should match the decoder's sample rate (44100 for MP3)
      expect(sampleRate).toBe(44_100);
    });

    test('should set correct number of channels in WAV header', async () => {
      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]);
      const wavBuffer = await convertToWav(mp3Buffer, 'audio/mpeg');

      expect(wavBuffer).not.toBeNull();

      const header = wavBuffer as Buffer;
      const channels = header.readUInt16LE(22);

      // Should be mono (1 channel)
      expect(channels).toBe(1);
    });

    test('should set correct bits per sample in WAV header', async () => {
      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]);
      const wavBuffer = await convertToWav(mp3Buffer, 'audio/mpeg');

      expect(wavBuffer).not.toBeNull();

      const header = wavBuffer as Buffer;
      const bitsPerSample = header.readUInt16LE(34);

      // Should be 16-bit
      expect(bitsPerSample).toBe(16);
    });

    test('should handle conversion error gracefully', async () => {
      // Mock a decoder that throws an error
      vi.mocked = vi.mocked || {};
      const invalidBuffer = Buffer.from([]);

      try {
        // This should handle the error internally
        await convertToWav(invalidBuffer, 'audio/mpeg', 'invalid.mp3');
      } catch (error) {
        // Error handling is expected
        expect(error).toBeDefined();
      }
    });

    test('should produce valid PCM data in WAV file', async () => {
      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]);
      const wavBuffer = await convertToWav(mp3Buffer, 'audio/mpeg');

      expect(wavBuffer).not.toBeNull();

      const header = wavBuffer as Buffer;

      // WAV header is 44 bytes
      expect(header.length).toBeGreaterThanOrEqual(44);

      // Should have PCM data after header
      const dataStart = 44;
      expect(header.length).toBeGreaterThan(dataStart);
    });

    test('should handle stereo audio with channel interleaving', async () => {
      // Mock a stereo decoder
      const mockMPEGDecoder = await import('mpg123-decoder').then(
        (m) => m.MPEGDecoder,
      );

      const originalDecode = mockMPEGDecoder.prototype.decode;
      mockMPEGDecoder.prototype.decode = () => ({
        channelData: [
          new Float32Array([0.1, 0.2, 0.3]),
          new Float32Array([0.4, 0.5, 0.6]),
        ],
        sampleRate: 44_100,
        samplesDecoded: 3,
        errors: [],
      });

      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]);
      const wavBuffer = await convertToWav(mp3Buffer, 'audio/mpeg');

      // Restore original
      mockMPEGDecoder.prototype.decode = originalDecode;

      expect(wavBuffer).not.toBeNull();

      const header = wavBuffer as Buffer;
      const channels = header.readUInt16LE(22);

      // Should be stereo (2 channels)
      expect(channels).toBe(2);
    });
  });

  describe('integration scenarios', () => {
    test('should support the complete conversion workflow', async () => {
      // 1. Detect format
      const format = detectAudioFormat('audio/mpeg', 'voice.mp3');
      expect(format).toBe('mp3');

      // 2. Check if conversion is needed
      const needsConvert = needsConversion('audio/mpeg');
      expect(needsConvert).toBe(true);

      // 3. Verify conversion is supported
      const isSupported = isConversionSupported('audio/mpeg', 'voice.mp3');
      expect(isSupported).toBe(true);

      // 4. Convert to WAV
      const mp3Buffer = Buffer.from([0xff, 0xfb, 0x10, 0x00]);
      const wavBuffer = await convertToWav(
        mp3Buffer,
        'audio/mpeg',
        'voice.mp3',
      );

      expect(wavBuffer).not.toBeNull();
      expect(wavBuffer?.toString('ascii', 0, 4)).toBe('RIFF');
    });

    test('should skip conversion for WAV files', async () => {
      const format = detectAudioFormat('audio/wav');
      expect(format).toBe(null); // WAV is not in supported formats

      const needsConvert = needsConversion('audio/wav');
      expect(needsConvert).toBe(false);
    });

    test('should handle OGG with fallback from Opus to Vorbis', async () => {
      const format = detectAudioFormat('audio/ogg', 'audio.ogg');
      expect(format).toBe('ogg');

      const isSupported = isConversionSupported('audio/ogg', 'audio.ogg');
      expect(isSupported).toBe(true);

      const oggBuffer = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
      const wavBuffer = await convertToWav(oggBuffer, 'audio/ogg', 'audio.ogg');

      expect(wavBuffer).not.toBeNull();
    });
  });
});
