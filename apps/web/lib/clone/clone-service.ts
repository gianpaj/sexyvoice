import { randomUUID } from 'node:crypto';
import { Mistral } from '@mistralai/mistralai';
import { logger } from '@sentry/nextjs';
import { parseBuffer } from 'music-metadata';
import Replicate, { type Prediction } from 'replicate';

import {
  AudioDecodeError,
  convertToWav,
  isConversionSupported,
  needsConversion,
  trimWavBuffer,
} from '@/lib/audio-converter';
import {
  type CloneProvider,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from '@/lib/clone/constants';

// ============================================================================
// Constants (shared with the internal /api/clone-voice route)
// ============================================================================

export const FALLBACK_MIN_DURATION = 10;
export const REPLICATE_REFERENCE_AUDIO_MAX_DURATION = 10;
export const VOXTRAL_MIN_DURATION = 3;
export const VOXTRAL_MAX_DURATION = 25;
export const REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION = 60;
export const REFERENCE_AUDIO_ENHANCEMENT_MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const REFERENCE_AUDIO_ENHANCEMENT_CREDITS_PER_SECOND = 10;
export const REFERENCE_AUDIO_ENHANCEMENT_DOLLARS_PER_SECOND = 0.001;

// Replicate multilingual supports the following languages
// https://replicate.com/resemble-ai/chatterbox-multilingual/api/schema
export const SUPPORTED_LOCALE_CODES = [
  { code: 'ar', value: 'arabic' },
  { code: 'da', value: 'danish' },
  { code: 'de', value: 'german' },
  { code: 'el', value: 'greek' },
  { code: 'en', value: 'english' },
  { code: 'en-multi', value: 'english' },
  { code: 'es', value: 'spanish' },
  { code: 'fi', value: 'finnish' },
  { code: 'fr', value: 'french' },
  { code: 'he', value: 'hebrew' },
  { code: 'hi', value: 'hindi' },
  { code: 'it', value: 'italian' },
  { code: 'ja', value: 'japanese' },
  { code: 'ko', value: 'korean' },
  { code: 'ms', value: 'malay' },
  { code: 'nl', value: 'dutch' },
  { code: 'no', value: 'norwegian' },
  { code: 'pl', value: 'polish' },
  { code: 'pt', value: 'portuguese' },
  { code: 'ru', value: 'russian' },
  { code: 'sv', value: 'swedish' },
  { code: 'sw', value: 'swahili' },
  { code: 'tr', value: 'turkish' },
  { code: 'zh', value: 'chinese' },
];

// ============================================================================
// Typed errors — provider/validation failures map to API errors in the route.
// Kept free of any HTTP/i18n coupling so the module stays reusable.
// ============================================================================

export type CloneServiceErrorCode =
  | 'unsupported_locale'
  | 'audio_duration_unknown'
  | 'audio_duration_too_short'
  | 'audio_conversion_failed'
  | 'unsupported_audio_format'
  | 'guardrail_violation'
  | 'provider_unavailable';

export class CloneServiceError extends Error {
  code: CloneServiceErrorCode;
  details?: Record<string, boolean | number | string | null>;

  constructor(
    code: CloneServiceErrorCode,
    message: string,
    details?: Record<string, boolean | number | string | null>,
  ) {
    super(message);
    this.name = 'CloneServiceError';
    this.code = code;
    this.details = details;
  }
}

interface CloneProviderConstraints {
  minDurationSeconds: number;
}

export interface ProcessedCloneInputAudio {
  audioHash: string;
  buffer: Buffer;
  duration: number | null;
  mimeType: string;
  originalDuration: number | null;
  wasTrimmed: boolean;
}

interface MistralSdkErrorLike {
  body?: unknown;
  message?: unknown;
  statusCode?: unknown;
}

// ============================================================================
// Provider / locale resolution
// ============================================================================

export function isVoxtralCloneLocale(locale: string): boolean {
  return VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale);
}

export function resolveCloneProvider(locale: string): CloneProvider {
  return isVoxtralCloneLocale(locale) ? 'mistral' : 'replicate';
}

export function getCloneProviderConstraints(
  provider: CloneProvider,
): CloneProviderConstraints {
  if (provider === 'mistral') {
    return { minDurationSeconds: VOXTRAL_MIN_DURATION };
  }
  return { minDurationSeconds: FALLBACK_MIN_DURATION };
}

export function validateLocale(locale: string): void {
  const localeConfig = SUPPORTED_LOCALE_CODES.find((l) => l.code === locale);
  if (!localeConfig) {
    throw new CloneServiceError(
      'unsupported_locale',
      `Unsupported language for voice cloning: ${locale}. Supported languages are: ${SUPPORTED_LOCALE_CODES.map((l) => l.code).join(', ')}`,
      { locale },
    );
  }
}

export function validateAudioDuration(
  duration: number | null,
  provider: CloneProvider,
): void {
  if (duration === null) {
    throw new CloneServiceError(
      'audio_duration_unknown',
      'Could not determine audio duration.',
    );
  }

  const constraints = getCloneProviderConstraints(provider);
  if (duration < constraints.minDurationSeconds) {
    throw new CloneServiceError(
      'audio_duration_too_short',
      `Reference audio must be at least ${constraints.minDurationSeconds} seconds for voice cloning.`,
      { MIN: constraints.minDurationSeconds },
    );
  }
}

// ============================================================================
// Enhancement billing helpers
// ============================================================================

export function calculateReferenceAudioEnhancementCredits(
  durationSeconds: number | null,
): number {
  if (durationSeconds === null) {
    throw new CloneServiceError(
      'audio_duration_unknown',
      'Could not determine audio duration.',
    );
  }
  return Math.ceil(
    Math.max(0, durationSeconds) *
      REFERENCE_AUDIO_ENHANCEMENT_CREDITS_PER_SECOND,
  );
}

export function getReferenceAudioEnhancementDollarCost(
  durationSeconds: number | null,
): number {
  if (durationSeconds === null) {
    return 0;
  }
  return (
    Math.max(0, durationSeconds) *
    REFERENCE_AUDIO_ENHANCEMENT_DOLLARS_PER_SECOND
  );
}

// ============================================================================
// Audio utilities
// ============================================================================

export function sanitizeFilename(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-zA-Z0-9.-]/g, '_'); // Replace special chars with underscore
}

export async function generateBufferHash(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getAudioDuration(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<number | null> {
  try {
    const metadata = await parseBuffer(
      fileBuffer,
      { mimeType, size: fileBuffer.length },
      { duration: true },
    );
    return metadata.format.duration ?? null;
  } catch {
    return null;
  }
}

/**
 * Normalize a reference-audio buffer for voice cloning: convert to WAV when the
 * provider needs it, trim to the provider's maximum reference duration, and
 * report the resulting duration.
 *
 * This is the buffer-based counterpart of the internal route's `processAudioFile`
 * (which operates on a `File`), so the external API can feed it either a fetched
 * URL or a decoded base64 payload.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Mirrors the internal route's audio normalization (convert + trim + duration).
export async function processCloneReferenceAudio({
  buffer,
  mimeType,
  filename,
  locale,
  enhancementEnabled,
}: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  locale: string;
  enhancementEnabled: boolean;
}): Promise<ProcessedCloneInputAudio> {
  const normalizedMimeType = mimeType.split(';')[0]?.trim().toLowerCase() || '';
  const provider = resolveCloneProvider(locale);

  let processedBuffer: Buffer = buffer;
  let processedMimeType = normalizedMimeType;
  let sourceDuration = await getAudioDuration(buffer, normalizedMimeType);
  let wasTrimmed = false;

  const canNormalizeToWav = isConversionSupported(normalizedMimeType, filename);
  const shouldNormalizeToWav =
    provider === 'mistral' || enhancementEnabled || canNormalizeToWav;

  if (shouldNormalizeToWav && needsConversion(normalizedMimeType)) {
    if (!isConversionSupported(normalizedMimeType, filename)) {
      throw new CloneServiceError(
        'unsupported_audio_format',
        'Unsupported audio format for voice cloning. Please use MP3, OGG/OPUS, or WAV.',
        { mimeType: normalizedMimeType },
      );
    }

    try {
      const wavBuffer = await convertToWav(
        buffer,
        normalizedMimeType,
        filename,
      );
      if (wavBuffer) {
        processedBuffer = wavBuffer as Buffer;
        processedMimeType = 'audio/wav';
      }
    } catch (conversionError) {
      if (!(conversionError instanceof AudioDecodeError)) {
        logger.warn('Clone API audio conversion failed', {
          extra: {
            error:
              conversionError instanceof Error
                ? conversionError.message
                : String(conversionError),
            normalizedMimeType,
            locale,
            filename,
          },
        });
      }
      throw new CloneServiceError(
        'audio_conversion_failed',
        'Failed to convert audio format to WAV. Reference audio must be MP3, OGG, Opus, or WAV.',
        { mimeType: normalizedMimeType },
      );
    }
  }

  let duration = await getAudioDuration(processedBuffer, processedMimeType);
  sourceDuration ??= duration;

  const referenceAudioMaxDuration =
    provider === 'mistral'
      ? VOXTRAL_MAX_DURATION
      : REPLICATE_REFERENCE_AUDIO_MAX_DURATION;

  if (duration !== null && duration > referenceAudioMaxDuration) {
    const trimmedBuffer = trimWavBuffer(
      processedBuffer,
      referenceAudioMaxDuration,
    );

    if (trimmedBuffer && trimmedBuffer !== processedBuffer) {
      processedBuffer = trimmedBuffer;
      processedMimeType = 'audio/wav';
      duration =
        (await getAudioDuration(processedBuffer, processedMimeType)) ??
        referenceAudioMaxDuration;
      wasTrimmed = true;
    } else if (provider === 'mistral') {
      throw new CloneServiceError(
        'audio_conversion_failed',
        'Failed to trim reference audio for voice cloning.',
      );
    }
  }

  const audioHash = await generateBufferHash(processedBuffer);

  return {
    audioHash,
    buffer: processedBuffer,
    mimeType: processedMimeType,
    duration,
    originalDuration: sourceDuration,
    wasTrimmed,
  };
}

// ============================================================================
// Voice cloning providers
// ============================================================================

let mistralClient: Mistral | null = null;

function getMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }
  if (!mistralClient) {
    mistralClient = new Mistral({ apiKey });
  }
  return mistralClient;
}

function getMistralErrorPayload(error: unknown): {
  code?: string;
  message?: string;
  rawStatusCode?: number;
  statusCode?: number;
  type?: string;
} {
  if (!(error && typeof error === 'object')) {
    return {};
  }

  const sdkError = error as MistralSdkErrorLike;
  const statusCode =
    typeof sdkError.statusCode === 'number' ? sdkError.statusCode : undefined;
  const body = typeof sdkError.body === 'string' ? sdkError.body : undefined;
  const message =
    typeof sdkError.message === 'string' ? sdkError.message : undefined;

  if (!body) {
    return { message, statusCode };
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return {
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      message: typeof parsed.message === 'string' ? parsed.message : message,
      rawStatusCode:
        typeof parsed.raw_status_code === 'number'
          ? parsed.raw_status_code
          : undefined,
      statusCode,
      type: typeof parsed.type === 'string' ? parsed.type : undefined,
    };
  } catch {
    return { message, statusCode };
  }
}

function isMistralGuardrailError(error: unknown): boolean {
  const payload = getMistralErrorPayload(error);
  const statusCode = payload.statusCode ?? payload.rawStatusCode;
  return (
    statusCode === 403 &&
    (payload.type === 'guardrail_violation' ||
      payload.code === '1920' ||
      payload.message?.toLowerCase().includes('guardrail') === true)
  );
}

export async function generateVoiceWithMistral(
  text: string,
  referenceAudioBuffer: Buffer,
): Promise<{ buffer: Buffer; modelUsed: string; requestId: string }> {
  const model = 'voxtral-mini-tts-2603';
  const client = getMistralClient();

  let response: Awaited<ReturnType<typeof client.audio.speech.complete>>;
  try {
    response = await client.audio.speech.complete({
      model,
      input: text,
      refAudio: referenceAudioBuffer.toString('base64'),
      responseFormat: 'wav',
    });
  } catch (error) {
    if (isMistralGuardrailError(error)) {
      throw new CloneServiceError(
        'guardrail_violation',
        'This request was blocked by a third-party voice cloning safety policy. Please try different text or a different reference audio.',
        { provider: 'mistral' },
      );
    }
    throw error;
  }

  const audioData = response.audioData;
  if (!audioData) {
    throw new Error('Mistral Voxtral response did not include audio data');
  }

  const buffer =
    typeof audioData === 'string'
      ? Buffer.from(audioData, 'base64')
      : Buffer.from(audioData);

  if (buffer.length === 0) {
    throw new Error('Mistral Voxtral response returned empty audio data');
  }

  const riffHeader = buffer.subarray(0, 4).toString('ascii');
  const waveHeader = buffer.subarray(8, 12).toString('ascii');
  if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
    throw new Error('Mistral Voxtral response did not return a valid WAV file');
  }

  return { buffer, modelUsed: model, requestId: randomUUID() };
}

interface ReplicateOutput {
  blob: () => Promise<Blob>;
  url: () => string;
}

export async function cloneVoiceWithReplicate(
  text: string,
  locale: string,
  audioReferenceUrl: string,
): Promise<{ blob: Blob; modelUsed: string; requestId: string }> {
  const localeConfig = SUPPORTED_LOCALE_CODES.find((l) => l.code === locale);
  if (!localeConfig) {
    throw new CloneServiceError(
      'unsupported_locale',
      `Unsupported locale: ${locale}`,
      { locale },
    );
  }

  const language = locale === 'en-multi' ? 'en' : locale;

  const replicate = new Replicate();
  let replicateResponse: Prediction | undefined;
  const onProgress = (prediction: Prediction) => {
    replicateResponse = prediction;
  };

  const model =
    'resemble-ai/chatterbox-multilingual:9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c' as `${string}/${string}`;
  const input = {
    seed: 0,
    text,
    language,
    cfg_weight: 0.5,
    temperature: 0.8,
    exaggeration: 0.5,
    reference_audio: audioReferenceUrl,
  };

  const output = (await replicate.run(model, { input }, onProgress)) as
    | ReplicateOutput
    | { error?: string };

  if (output && typeof output === 'object' && 'error' in output) {
    logger.warn('Replicate voice cloning provider failed', {
      extra: { locale, language, model, errorMessage: output.error || null },
    });
    throw new CloneServiceError(
      'provider_unavailable',
      'Voice cloning provider is temporarily unavailable. Please try again.',
      { provider: 'replicate' },
    );
  }

  const audioBlob = await (output as ReplicateOutput).blob();

  return {
    blob: audioBlob,
    modelUsed: model.split(':')[0],
    requestId: replicateResponse?.id || 'unknown',
  };
}
