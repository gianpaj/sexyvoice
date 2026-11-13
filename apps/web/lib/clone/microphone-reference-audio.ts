'use client';

import { MICROPHONE_RECORDING_NAME } from './reference-audio';

type AudioConverter = (blob: Blob, format: 'wav') => Promise<Blob>;

/** Takes the server decodes as recorded, by MIME type, with their extension. */
const UPLOAD_EXTENSIONS = new Map([
  ['audio/mp3', 'mp3'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/opus', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
]);

/** `audio/webm;codecs=opus` -> `audio/webm` */
function mimeEssence(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

/**
 * Other takes, such as Chrome's WebM or Safari's MP4, are converted to WAV in
 * the browser before upload.
 */
export function needsWavConversion(blob: Blob): boolean {
  return blob.type !== '' && !UPLOAD_EXTENSIONS.has(mimeEssence(blob.type));
}

export async function createMicrophoneReferenceAudioFile(
  micBlob: Blob,
  convert: AudioConverter,
): Promise<File> {
  if (needsWavConversion(micBlob)) {
    const wavBlob = await convert(micBlob, 'wav');
    return new File([wavBlob], `${MICROPHONE_RECORDING_NAME}.wav`, {
      type: wavBlob.type || 'audio/wav',
    });
  }

  const mimeType = micBlob.type || 'audio/wav';
  const extension = UPLOAD_EXTENSIONS.get(mimeEssence(mimeType)) ?? 'wav';
  return new File([micBlob], `${MICROPHONE_RECORDING_NAME}.${extension}`, {
    type: mimeType,
  });
}
