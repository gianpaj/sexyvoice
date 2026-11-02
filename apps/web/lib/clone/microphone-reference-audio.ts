'use client';

type AudioConverter = (blob: Blob, format: 'wav') => Promise<Blob>;

export function isWebmAudioBlob(blob: Blob): boolean {
  return blob.type.toLowerCase().includes('webm');
}

// Keep the file extension aligned with the blob's MIME type so name and type
// don't disagree (e.g. avoid `microphone-recording.wav` with `type: audio/ogg`).
function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('ogg') || normalized.includes('opus')) {
    return 'ogg';
  }
  if (normalized.includes('mpeg') || normalized.includes('mp3')) {
    return 'mp3';
  }
  return 'wav';
}

export async function createMicrophoneReferenceAudioFile(
  micBlob: Blob,
  convert: AudioConverter,
): Promise<File> {
  if (isWebmAudioBlob(micBlob)) {
    const wavBlob = await convert(micBlob, 'wav');
    return new File([wavBlob], 'microphone-recording.wav', {
      type: wavBlob.type || 'audio/wav',
    });
  }

  const mimeType = micBlob.type || 'audio/wav';
  const extension = extensionForMimeType(mimeType);
  return new File([micBlob], `microphone-recording.${extension}`, {
    type: mimeType,
  });
}
