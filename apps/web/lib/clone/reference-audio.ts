/**
 * Upload contract for voice-cloning reference audio, shared by
 * `POST /api/clone-voice`, the Clone page and the call clone dialog.
 */

/** Vercel rejects request bodies over 4.5 MB. */
export const REFERENCE_AUDIO_MAX_BYTES = 4.5 * 1024 * 1024;

/** MIME types the clone route accepts. */
export const REFERENCE_AUDIO_MIME_TYPES: readonly string[] = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  // Opus files (.opus) use audio/opus or audio/x-opus.
  'audio/opus',
  'audio/x-opus',
  // Browser recordings are WebM/Opus, reported as audio/webm or video/webm.
  'audio/webm',
  'video/webm',
  'application/octet-stream',
];

/** The Clone page's file picker `accept` list. */
export const REFERENCE_AUDIO_ACCEPT =
  'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/x-wav,audio/m4a,audio/x-m4a,audio/opus,audio/x-opus,video/webm,.opus';

/**
 * The picker list for saving a call voice. Saves convert the reference to WAV
 * on the server, which decodes MP3, WAV and Ogg (Vorbis or Opus) only.
 */
export const SAVED_VOICE_AUDIO_ACCEPT =
  'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/opus,audio/x-opus,.opus';

/**
 * Name of uploaded microphone takes. The route treats files with this name
 * as recordings and skips the upload format check.
 */
export const MICROPHONE_RECORDING_NAME = 'microphone-recording';

export const VOICE_NAME_MAX_LENGTH = 50;
