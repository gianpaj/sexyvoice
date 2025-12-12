import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const FFMPEG_CORE_VERSION = '0.12.6';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/**
 * Get or initialize the FFmpeg instance (singleton pattern for server-side use)
 */
function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return Promise.resolve(ffmpegInstance);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }: { message: string }) => {
      console.log('[FFmpeg Server]', message);
    });

    const baseURL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        'application/wasm',
      ),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

/**
 * Get the file extension from a MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
  };

  return mimeToExt[mimeType] || 'mp3';
}

/**
 * Convert audio buffer to WAV format with specific settings
 * Uses ffmpeg with: -ar 24000 -ac 1 (24kHz sample rate, mono)
 *
 * @param inputBuffer - The input audio buffer
 * @param mimeType - The MIME type of the input audio
 * @returns The converted WAV buffer
 */
export async function convertAudioToWav(
  inputBuffer: Buffer,
  mimeType: string,
): Promise<Buffer> {
  const ffmpeg = await getFFmpeg();

  const inputExt = getExtensionFromMimeType(mimeType);
  const inputName = `input.${inputExt}`;
  const outputName = 'output.wav';

  try {
    // Write input file to FFmpeg's virtual filesystem
    await ffmpeg.writeFile(inputName, new Uint8Array(inputBuffer));

    // Convert to WAV with specified settings:
    // -ar 24000: Sample rate 24kHz
    // -ac 1: Mono (1 channel)
    // -c:a pcm_s16le: 16-bit PCM audio codec (standard for WAV)
    await ffmpeg.exec([
      '-i',
      inputName,
      '-ar',
      '24000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      outputName,
    ]);

    // Read the output file
    const data = await ffmpeg.readFile(outputName);

    // Clean up virtual filesystem
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    // Convert to Buffer
    if (typeof data === 'string') {
      return Buffer.from(data);
    }
    return Buffer.from(data.buffer);
  } catch (error) {
    // Attempt cleanup on error
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (_e) {
      // Ignore cleanup errors
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch (_e) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Check if the audio file needs conversion (not already in WAV format)
 */
export function needsConversion(mimeType: string): boolean {
  const wavMimeTypes = ['audio/wav', 'audio/x-wav'];
  return !wavMimeTypes.includes(mimeType);
}
