import { fal } from '@fal-ai/client';

const REFERENCE_AUDIO_ENHANCEMENT_MODEL =
  'fal-ai/deepfilternet3' as `${string}/${string}`;
const REFERENCE_AUDIO_ENHANCEMENT_TIMEOUT_MS = 60_000;
const MAX_ENHANCED_AUDIO_BYTES = 50 * 1024 * 1024;

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

function createReferenceAudioEnhancementSignal(
  abortSignal?: AbortSignal,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(
    REFERENCE_AUDIO_ENHANCEMENT_TIMEOUT_MS,
  );

  return abortSignal
    ? AbortSignal.any([abortSignal, timeoutSignal])
    : timeoutSignal;
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
  const requestSignal = createReferenceAudioEnhancementSignal(abortSignal);
  const inputBytes = new Uint8Array(
    buffer.buffer as ArrayBuffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const inputFile = new File(
    [inputBytes],
    filename,
    {
      type: mimeType || 'audio/wav',
    },
  );

  const falResult = await fal.subscribe(REFERENCE_AUDIO_ENHANCEMENT_MODEL, {
    input: {
      audio_format: 'wav',
      audio_url: inputFile,
    },
    logs: false,
    abortSignal: requestSignal,
  });

  const falData = falResult.data as FalEnhancedAudioResponse;
  const enhancedAudioUrl = falData.audio_file?.url;

  if (!enhancedAudioUrl) {
    throw new Error(
      'Reference audio enhancement did not return an audio file URL',
    );
  }

  const enhancedAudioResponse = await fetch(enhancedAudioUrl, {
    signal: requestSignal,
  });

  if (!enhancedAudioResponse.ok) {
    throw new Error(
      `Reference audio enhancement audio download failed with status ${enhancedAudioResponse.status}`,
    );
  }

  const responseMimeType =
    enhancedAudioResponse.headers.get('content-type') ||
    falData.audio_file?.content_type ||
    'audio/wav';
  const normalizedMimeType =
    responseMimeType.split(';')[0]?.trim().toLowerCase() || 'audio/wav';

  if (!normalizedMimeType.startsWith('audio/')) {
    throw new Error(
      `Reference audio enhancement returned unsupported content type: ${normalizedMimeType}`,
    );
  }

  const contentLength = enhancedAudioResponse.headers.get('content-length');
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_ENHANCED_AUDIO_BYTES
  ) {
    throw new Error('Reference audio enhancement audio exceeds size limit');
  }

  const enhancedAudioArrayBuffer = await enhancedAudioResponse.arrayBuffer();
  const enhancedAudioBuffer = Buffer.from(enhancedAudioArrayBuffer);

  if (enhancedAudioBuffer.length > MAX_ENHANCED_AUDIO_BYTES) {
    throw new Error('Reference audio enhancement audio exceeds size limit');
  }

  if (enhancedAudioBuffer.length === 0) {
    throw new Error('Reference audio enhancement returned empty audio data');
  }

  return {
    buffer: enhancedAudioBuffer,
    mimeType: normalizedMimeType,
    modelUsed: REFERENCE_AUDIO_ENHANCEMENT_MODEL,
    publicUrl: enhancedAudioUrl,
    requestId: falResult.requestId,
  };
}
