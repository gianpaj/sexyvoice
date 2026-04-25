import { fal } from '@fal-ai/client';

const REFERENCE_AUDIO_ENHANCEMENT_MODEL =
  'fal-ai/deepfilternet3' as `${string}/${string}`;
const REFERENCE_AUDIO_ENHANCEMENT_TIMEOUT_MS = 60_000;
const MAX_ENHANCED_AUDIO_BYTES = 50 * 1024 * 1024;
const ALLOWED_ENHANCED_AUDIO_HOSTS = ['fal-cdn.com', 'fal.media'];

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

function assertAllowedEnhancedAudioUrl(url: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Reference audio enhancement returned an invalid URL');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isAllowedHost = ALLOWED_ENHANCED_AUDIO_HOSTS.some(
    (allowedHost) =>
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
  );

  if (parsedUrl.protocol !== 'https:' || !isAllowedHost) {
    throw new Error('Reference audio enhancement returned an untrusted URL');
  }
}

async function readEnhancedAudioBuffer(response: Response): Promise<Buffer> {
  if (!response.body) {
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    if (audioBuffer.length > MAX_ENHANCED_AUDIO_BYTES) {
      throw new Error('Reference audio enhancement audio exceeds size limit');
    }

    return audioBuffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_ENHANCED_AUDIO_BYTES) {
        throw new Error('Reference audio enhancement audio exceeds size limit');
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
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

  assertAllowedEnhancedAudioUrl(enhancedAudioUrl);

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

  const enhancedAudioBuffer =
    await readEnhancedAudioBuffer(enhancedAudioResponse);

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
