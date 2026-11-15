import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

/** Pinned core build from unpkg, which the CSP in next.config.js allows. */
const FFMPEG_CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

/**
 * Formats the browser audio tools can write: encoder arguments, MIME type
 * and the label the converter shows, in the converter's menu order.
 */
export const AUDIO_OUTPUT_FORMATS = {
  mp3: {
    args: ['-codec:a', 'libmp3lame', '-q:a', '2'],
    label: 'MP3',
    mime: 'audio/mpeg',
  },
  wav: { args: ['-codec:a', 'pcm_s16le'], label: 'WAV', mime: 'audio/wav' },
  aac: {
    args: ['-codec:a', 'aac', '-b:a', '192k'],
    label: 'AAC',
    mime: 'audio/aac',
  },
  ogg: {
    args: ['-codec:a', 'libvorbis', '-q:a', '4'],
    label: 'OGG',
    mime: 'audio/ogg',
  },
  flac: { args: ['-codec:a', 'flac'], label: 'FLAC', mime: 'audio/flac' },
  m4a: {
    args: ['-codec:a', 'aac', '-b:a', '192k'],
    label: 'M4A',
    mime: 'audio/mp4',
  },
  mp4: {
    args: ['-codec:a', 'aac', '-b:a', '192k'],
    label: 'MP4',
    mime: 'audio/mp4',
  },
} as const;

export type AudioOutputFormat = keyof typeof AUDIO_OUTPUT_FORMATS;

/** A new FFmpeg instance running the pinned core. */
export async function loadFFmpeg(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(
      `${FFMPEG_CORE_URL}/ffmpeg-core.js`,
      'text/javascript',
    ),
    wasmURL: await toBlobURL(
      `${FFMPEG_CORE_URL}/ffmpeg-core.wasm`,
      'application/wasm',
    ),
  });
  return ffmpeg;
}

/** Encodes the FFmpeg file `inputName` to `format` and returns the audio. */
export async function encodeAudio(
  ffmpeg: FFmpeg,
  inputName: string,
  format: AudioOutputFormat,
): Promise<Blob> {
  const outputName = `output.${format}`;
  const { args, mime } = AUDIO_OUTPUT_FORMATS[format];
  await ffmpeg.exec(['-i', inputName, ...args, outputName]);
  const data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(outputName);
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data).buffer
      : (data.buffer as ArrayBuffer);
  return new Blob([bytes], { type: mime });
}
