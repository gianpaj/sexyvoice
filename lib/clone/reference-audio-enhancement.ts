import { fal } from '@fal-ai/client';

const REFERENCE_AUDIO_ENHANCEMENT_MODEL =
  'fal-ai/deepfilternet3' as `${string}/${string}`;

interface FalEnhancedAudioResponse {
  audio_file?: {
    content_type?: string;
    file_name?: string;
    file_size?: number;
    url?: string;
  };
}

export interface EnhancedReferenceAudioResult {
  buffer: Buffer;
  mimeType: string;
  modelUsed: string;
  publicUrl: string;
  requestId: string;
}

export async function enhanceReferenceAudio({
  abortSignal,
  buffer,
  filename,
  mimeType,
}: {
  abortSignal?: AbortSignal;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<EnhancedReferenceAudioResult> {
  const inputFile = new File([buffer], filename, {
    type: mimeType || 'audio/wav',
  });

  const falResult = await fal.subscribe(REFERENCE_AUDIO_ENHANCEMENT_MODEL, {
    input: {
      audio_format: 'wav',
      audio_url: inputFile,
    },
    logs: false,
    abortSignal,
  });

  const falData = falResult.data as FalEnhancedAudioResponse;
  const enhancedAudioUrl = falData.audio_file?.url;

  if (!enhancedAudioUrl) {
    throw new Error(
      'Reference audio enhancement did not return an audio file URL',
    );
  }

  const enhancedAudioResponse = await fetch(enhancedAudioUrl, {
    signal: abortSignal,
  });

  if (!enhancedAudioResponse.ok) {
    throw new Error(
      `Reference audio enhancement audio download failed with status ${enhancedAudioResponse.status}`,
    );
  }

  const enhancedAudioArrayBuffer = await enhancedAudioResponse.arrayBuffer();
  const enhancedAudioBuffer = Buffer.from(enhancedAudioArrayBuffer);

  if (enhancedAudioBuffer.length === 0) {
    throw new Error('Reference audio enhancement returned empty audio data');
  }

  const responseMimeType =
    enhancedAudioResponse.headers.get('content-type') ||
    falData.audio_file?.content_type ||
    'audio/wav';
  const normalizedMimeType =
    responseMimeType.split(';')[0]?.trim().toLowerCase() || 'audio/wav';

  return {
    buffer: enhancedAudioBuffer,
    mimeType: normalizedMimeType,
    modelUsed: REFERENCE_AUDIO_ENHANCEMENT_MODEL,
    publicUrl: enhancedAudioUrl,
    requestId: falResult.requestId,
  };
}
