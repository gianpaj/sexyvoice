/**
 * Audio converter utility using wasm-audio-decoders
 *
 * Converts MP3, OGG (Opus/Vorbis), and WebM/Opus audio files to WAV format
 * for use with voice cloning APIs that require WAV input.
 *
 * Uses:
 * - mpg123-decoder for MP3 files
 * - ogg-opus-decoder for Ogg Opus files
 * - @wasm-audio-decoders/ogg-vorbis for Ogg Vorbis files
 */

import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { MPEGDecoder } from 'mpg123-decoder';
import { OggOpusDecoder } from 'ogg-opus-decoder';

export type SupportedAudioFormat = 'mp3' | 'ogg' | 'opus' | 'vorbis' | 'webm';

interface DecodedAudio {
  channelData: Float32Array[];
  sampleRate: number;
  samplesDecoded: number;
}

function isValidChannelData(
  channelData: Float32Array[] | undefined,
): channelData is [Float32Array, ...Float32Array[]] {
  if (!Array.isArray(channelData) || channelData.length === 0) {
    return false;
  }

  const firstChannel = channelData[0];
  if (!(firstChannel instanceof Float32Array) || firstChannel.length === 0) {
    return false;
  }

  return channelData.every(
    (channel) =>
      channel instanceof Float32Array && channel.length === firstChannel.length,
  );
}

function validateDecodedAudio(
  decoded: DecodedAudio,
  format: SupportedAudioFormat,
): asserts decoded is DecodedAudio & {
  channelData: [Float32Array, ...Float32Array[]];
} {
  if (!isValidChannelData(decoded.channelData)) {
    throw new Error(
      `Decoded ${format} audio did not contain valid channel data`,
    );
  }

  if (!Number.isFinite(decoded.sampleRate) || decoded.sampleRate <= 0) {
    throw new Error(
      `Decoded ${format} audio did not contain a valid sample rate`,
    );
  }
}

/**
 * Detect audio format from MIME type or file extension
 */
export function detectAudioFormat(
  mimeType: string,
  filename?: string,
): SupportedAudioFormat | null {
  // Strip parameters (e.g. "audio/webm;codecs=opus" -> "audio/webm")
  const normalizedMime = mimeType.split(';')[0]?.trim().toLowerCase();

  // Check MIME type first
  if (
    normalizedMime === 'audio/mpeg' ||
    normalizedMime === 'audio/mp3' ||
    normalizedMime === 'audio/x-mp3'
  ) {
    return 'mp3';
  }

  if (normalizedMime === 'audio/webm') {
    return 'webm';
  }

  if (
    normalizedMime === 'audio/ogg' ||
    normalizedMime === 'audio/opus' ||
    normalizedMime === 'audio/x-opus'
  ) {
    return 'ogg'; // Will try Opus first, then Vorbis
  }

  if (
    normalizedMime === 'audio/vorbis' ||
    normalizedMime === 'audio/x-vorbis'
  ) {
    return 'vorbis';
  }

  // Fallback to file extension
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'mp3') return 'mp3';
    if (ext === 'ogg' || ext === 'opus') return 'ogg';
    if (ext === 'webm') return 'webm';
  }

  return null;
}

/**
 * Decode MP3 audio to PCM using mpg123-decoder
 */
async function decodeMp3(audioData: Uint8Array): Promise<DecodedAudio> {
  const decoder = new MPEGDecoder();
  await decoder.ready;

  try {
    const result = decoder.decode(audioData);
    return {
      channelData: result.channelData,
      sampleRate: result.sampleRate,
      samplesDecoded: result.samplesDecoded,
    };
  } finally {
    decoder.free();
  }
}

/**
 * Decode Ogg Opus audio to PCM using ogg-opus-decoder
 */
async function decodeOggOpus(audioData: Uint8Array): Promise<DecodedAudio> {
  const decoder = new OggOpusDecoder();
  await decoder.ready;

  try {
    const result = await decoder.decodeFile(audioData);
    return {
      channelData: result.channelData,
      sampleRate: result.sampleRate,
      samplesDecoded: result.samplesDecoded,
    };
  } finally {
    decoder.free();
  }
}

/**
 * Decode Ogg Vorbis audio to PCM using @wasm-audio-decoders/ogg-vorbis
 */
async function decodeOggVorbis(audioData: Uint8Array): Promise<DecodedAudio> {
  const decoder = new OggVorbisDecoder();
  await decoder.ready;

  try {
    const result = await decoder.decodeFile(audioData);
    return {
      channelData: result.channelData,
      sampleRate: result.sampleRate,
      samplesDecoded: result.samplesDecoded,
    };
  } finally {
    decoder.free();
  }
}

/**
 * Convert Float32 PCM samples to Int16 PCM samples
 */
function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);

  for (let i = 0; i < float32Array.length; i++) {
    // Clamp the value to [-1, 1] range
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    // Convert to 16-bit integer
    int16Array[i] = sample < 0 ? sample * 0x80_00 : sample * 0x7f_ff;
  }

  return int16Array;
}

/**
 * Interleave multiple audio channels into a single array
 */
function interleaveChannels(channelData: Float32Array[]): Float32Array {
  const numChannels = channelData.length;
  if (numChannels === 0) {
    throw new Error('Decoded audio contains no channels');
  }
  if (numChannels === 1) {
    return channelData[0];
  }

  const length = channelData[0].length;
  const interleaved = new Float32Array(length * numChannels);

  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      interleaved[i * numChannels + channel] = channelData[channel][i];
    }
  }

  return interleaved;
}

/**
 * Create a WAV file buffer from PCM data
 */
function createWavBuffer(
  pcmData: Int16Array,
  sampleRate: number,
  numChannels: number,
): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length * 2; // 2 bytes per sample for 16-bit

  // WAV header is 44 bytes
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4); // File size - 8
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write PCM data
  for (let i = 0; i < pcmData.length; i++) {
    buffer.writeInt16LE(pcmData[i], 44 + i * 2);
  }

  return buffer;
}

interface WavChunk {
  chunkStart: number;
  dataStart: number;
  size: number;
}

function findWavChunk(buffer: Buffer, chunkId: string): WavChunk | null {
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;

    if (dataEnd > buffer.length) {
      return null;
    }

    if (id === chunkId) {
      return {
        chunkStart: offset,
        dataStart,
        size,
      };
    }

    offset = dataEnd + (size % 2);
  }

  return null;
}

export function trimWavBuffer(
  wavBuffer: Buffer,
  maxDurationSeconds: number,
): Buffer | null {
  if (
    wavBuffer.length < 44 ||
    wavBuffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    wavBuffer.subarray(8, 12).toString('ascii') !== 'WAVE'
  ) {
    return null;
  }

  const fmtChunk = findWavChunk(wavBuffer, 'fmt ');
  const dataChunk = findWavChunk(wavBuffer, 'data');
  if (!(fmtChunk && dataChunk) || fmtChunk.size < 16) {
    return null;
  }

  const sampleRate = wavBuffer.readUInt32LE(fmtChunk.dataStart + 4);
  const blockAlign = wavBuffer.readUInt16LE(fmtChunk.dataStart + 12);

  if (
    !Number.isFinite(maxDurationSeconds) ||
    maxDurationSeconds <= 0 ||
    sampleRate <= 0 ||
    blockAlign <= 0
  ) {
    return null;
  }

  const maxFrames = Math.floor(maxDurationSeconds * sampleRate);
  const maxDataBytes = maxFrames * blockAlign;
  const trimmedDataBytes = Math.min(dataChunk.size, maxDataBytes);

  if (trimmedDataBytes >= dataChunk.size) {
    return wavBuffer;
  }

  const prefix = Buffer.from(wavBuffer.subarray(0, dataChunk.dataStart));
  prefix.writeUInt32LE(trimmedDataBytes, dataChunk.chunkStart + 4);

  const trimmed = Buffer.concat([
    prefix,
    wavBuffer.subarray(
      dataChunk.dataStart,
      dataChunk.dataStart + trimmedDataBytes,
    ),
  ]);
  trimmed.writeUInt32LE(trimmed.length - 8, 4);

  return trimmed;
}

/**
 * Convert audio buffer to WAV format
 *
 * @param audioBuffer - The input audio file as a Buffer
 * @param mimeType - The MIME type of the input audio
 * @param filename - Optional filename for format detection fallback
 * @returns WAV file as a Buffer, or null if format is not supported
 */
export async function convertToWav(
  audioBuffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<Buffer | null> {
  const format = detectAudioFormat(mimeType, filename);

  if (!format) {
    return null;
  }

  // WebM cannot be converted on the server (ffmpeg.wasm doesn't support Node.js)
  // WebM should be converted to WAV on the client-side before uploading
  if (format === 'webm') {
    throw new Error(
      'WebM format must be converted to WAV on the client-side before uploading. ' +
        'Server-side WebM conversion is not supported (ffmpeg.wasm requires browser environment).',
    );
  }

  const audioData = new Uint8Array(audioBuffer);
  let decoded: DecodedAudio;

  try {
    switch (format) {
      case 'mp3':
        decoded = await decodeMp3(audioData);
        break;

      case 'ogg':
      case 'opus': {
        // Try Opus first, fall back to Vorbis.
        // Some files (e.g. WhatsApp .opus) are parsed by ogg-opus-decoder without
        // throwing but return 0 decoded channels — treat that as a decode failure
        // and fall through to the Vorbis decoder.
        let opusResult: DecodedAudio | null = null;
        try {
          opusResult = await decodeOggOpus(audioData);
        } catch (_opusError) {
          // fall through to Vorbis below
        }
        if (
          !opusResult ||
          opusResult.channelData.length === 0 ||
          opusResult.samplesDecoded === 0
        ) {
          decoded = await decodeOggVorbis(audioData);
        } else {
          decoded = opusResult;
        }
        break;
      }

      case 'vorbis':
        decoded = await decodeOggVorbis(audioData);
        break;

      default:
        return null;
    }
  } catch (error) {
    console.error(`Failed to decode ${format} audio:`, error);
    throw new Error(
      `Failed to decode ${format} audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  validateDecodedAudio(decoded, format);

  // Interleave channels if stereo/multi-channel
  const interleaved = interleaveChannels(decoded.channelData);

  // Convert Float32 to Int16
  const int16Data = float32ToInt16(interleaved);

  // Create WAV buffer
  const wavBuffer = createWavBuffer(
    int16Data,
    decoded.sampleRate,
    decoded.channelData.length,
  );

  return wavBuffer;
}

/**
 * Check if the audio format needs conversion to WAV
 * WAV files don't need conversion
 */
export function needsConversion(mimeType: string): boolean {
  const normalizedMime = mimeType.toLowerCase();
  return !(
    normalizedMime === 'audio/wav' ||
    normalizedMime === 'audio/x-wav' ||
    normalizedMime === 'audio/wave'
  );
}

/**
 * Check if the audio format is supported for conversion
 */
export function isConversionSupported(
  mimeType: string,
  filename?: string,
): boolean {
  const format = detectAudioFormat(mimeType, filename);
  return format !== null;
}
