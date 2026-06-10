'use client';

type AudioConverter = (blob: Blob, format: 'wav') => Promise<Blob>;

export function isWebmAudioBlob(blob: Blob): boolean {
  return blob.type.toLowerCase().includes('webm');
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
  return new File([micBlob], 'microphone-recording.wav', {
    type: mimeType,
  });
}
