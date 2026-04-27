import { randomUUID } from 'node:crypto';
import { Mistral } from '@mistralai/mistralai';
import { captureException, logger, setUser } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { parseBuffer } from 'music-metadata';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { generateHash } from '@/lib/audio';
import {
  convertToWav,
  isConversionSupported,
  needsConversion,
} from '@/lib/audio-converter';
import {
  type CloneProvider,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from '@/lib/clone/constants';
import { enhanceReferenceAudio } from '@/lib/clone/reference-audio-enhancement';
import PostHogClient from '@/lib/posthog';
import { uploadFileToR2 } from '@/lib/storage/upload';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import {
  getCredits,
  hasUserPaid,
  insertUsageEvent,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCredits, getDollarCost } from '@/lib/utils';

const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  // Opus files (.opus) use audio/opus or audio/x-opus MIME types
  'audio/opus',
  'audio/x-opus',
  // Microphone recordings often come in as WebM/Opus and may be reported as audio/webm or video/webm
  'audio/webm',
  'video/webm',
  'application/octet-stream',
];

const MAX_LENGTH_EN = 500;
const MAX_LENGTH_MULTILANGUAGE = 300;
const FALLBACK_MIN_DURATION = 10;
const FALLBACK_MAX_DURATION = 5 * 60; // 5 minutes
const VOXTRAL_MIN_DURATION = 3;
const VOXTRAL_MAX_DURATION = 25;
const REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION = 60;
const REFERENCE_AUDIO_ENHANCEMENT_MAX_INPUT_BYTES = 25 * 1024 * 1024;
const REFERENCE_AUDIO_ENHANCEMENT_CREDITS_PER_SECOND = 10;
const REFERENCE_AUDIO_ENHANCEMENT_DOLLARS_PER_SECOND = 0.001;

// Replicate multilinguage supports the following languages
// https://replicate.com/resemble-ai/chatterbox-multilingual/api/schema
const SUPPORTED_LOCALE_CODES = [
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

export const maxDuration = 600; // seconds - fluid compute is enabled

// ============================================================================
// Types
// ============================================================================

interface ReplicateOutput {
  blob: () => Promise<Blob>;
  url: () => string;
}

interface ReplicateError {
  error?: string;
}

type ReplicateResponse = ReplicateOutput | ReplicateError;

interface CloneProviderConstraints {
  maxDurationSeconds: number;
  minDurationSeconds: number;
}

interface ProcessedCloneInputAudio {
  audioHash: string;
  buffer: Buffer;
  duration: number | null;
  mimeType: string;
  publicUrl?: string;
}

interface FormInput {
  enhanceReferenceAudio: boolean;
  file: File;
  locale: string;
  text: string;
}

type RouteErrorDetails = Record<string, boolean | number | string | null>;

type CloneRouteErrorCode =
  | 'errors.audioConversionFailed'
  | 'errors.audioConversionRequiredWebm'
  | 'errors.audioDurationInvalidFallback'
  | 'errors.audioDurationInvalidVoxtral'
  | 'errors.audioDurationUnknown'
  | 'errors.fileTooLarge'
  | 'errors.insufficientCredits'
  | 'errors.internalError'
  | 'errors.invalidContentType'
  | 'errors.invalidFileType'
  | 'errors.missingLocale'
  | 'errors.missingRequiredParameters'
  | 'errors.referenceAudioEnhancementInputTooLarge'
  | 'errors.referenceAudioEnhancementInputTooLong'
  | 'errors.textTooLong'
  | 'errors.unsupportedAudioFormat'
  | 'errors.unsupportedLocale'
  | 'errors.userNotFound';

class RouteError extends Error {
  code?: CloneRouteErrorCode;
  details?: RouteErrorDetails;
  status: number;
  serverMessage: string;

  constructor(
    serverMessage: string,
    status: number,
    code?: CloneRouteErrorCode,
    details?: RouteErrorDetails,
  ) {
    super(`${serverMessage} (${status})`);
    this.name = 'RouteError';
    this.status = status;
    this.serverMessage = serverMessage;
    this.code = code;
    this.details = details;
  }
}

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

function createRouteError(
  serverMessage: string,
  status: number,
  code?: CloneRouteErrorCode,
  details?: RouteErrorDetails,
): RouteError {
  return new RouteError(serverMessage, status, code, details);
}

function routeErrorResponse(
  serverMessage: string,
  status: number,
  code?: CloneRouteErrorCode,
  details?: RouteErrorDetails,
) {
  return NextResponse.json(
    {
      error: `${serverMessage} (${status})`,
      serverMessage,
      status,
      code,
      details,
    },
    { status },
  );
}

// ============================================================================
// Utilities
// ============================================================================

const redis = Redis.fromEnv();

const sanitizeFilename = (filename: string): string => {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-zA-Z0-9.-]/g, '_'); // Replace special chars with underscore
};

async function generateBufferHash(buffer: Buffer): Promise<string> {
  // Use a content-based SHA-256 hash so identical uploads produce the same cache key.
  // This allows R2/Redis entries to be reused deterministically instead of depending on timestamps.
  // `new Uint8Array(buffer)` creates a view over the existing Buffer data here, so it does not
  // materially increase memory usage beyond hashing the already in-memory upload.
  const data = new Uint8Array(buffer);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getAudioDuration(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<number | null> {
  try {
    const metadata = await parseBuffer(
      fileBuffer,
      {
        mimeType,
        size: fileBuffer.length,
      },
      {
        duration: true,
      },
    );

    return metadata.format.duration ?? null;
  } catch (_e) {
    return null;
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

function isVoxtralCloneLocale(locale: string): boolean {
  return VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale);
}

function resolveCloneProvider(locale: string): CloneProvider {
  return isVoxtralCloneLocale(locale) ? 'mistral' : 'replicate';
}

function getCloneProviderConstraints(
  provider: CloneProvider,
): CloneProviderConstraints {
  if (provider === 'mistral') {
    return {
      minDurationSeconds: VOXTRAL_MIN_DURATION,
      maxDurationSeconds: VOXTRAL_MAX_DURATION,
    };
  }

  return {
    minDurationSeconds: FALLBACK_MIN_DURATION,
    maxDurationSeconds: FALLBACK_MAX_DURATION,
  };
}

function validateContentType(contentType: string): void {
  if (!contentType.startsWith('multipart/form-data')) {
    throw createRouteError(
      'Content-Type must be multipart/form-data',
      400,
      'errors.invalidContentType',
      { contentType },
    );
  }
}

async function parseFormData(request: Request): Promise<FormInput> {
  const formData = await request.formData();

  const enhanceReferenceAudioValue = formData.get('enhanceReferenceAudio');
  const textValue = formData.get('text');
  const file = formData.get('file');
  const locale = formData.get('locale');

  const text = typeof textValue === 'string' ? textValue : '';
  const audioFile = file instanceof File ? file : null;
  const shouldEnhanceReferenceAudio =
    typeof enhanceReferenceAudioValue === 'string' &&
    enhanceReferenceAudioValue === 'true';
  const localeStr = typeof locale === 'string' ? locale : '';

  if (!(text && audioFile)) {
    throw createRouteError(
      'Missing required parameters: text and audio file',
      400,
      'errors.missingRequiredParameters',
    );
  }

  if (!localeStr) {
    throw createRouteError(
      'Missing required parameter: locale',
      400,
      'errors.missingLocale',
    );
  }

  return {
    text,
    file: audioFile,
    locale: localeStr,
    enhanceReferenceAudio: shouldEnhanceReferenceAudio,
  };
}

function validateTextLength(text: string, locale: string): void {
  const maxLength = locale === 'en' ? MAX_LENGTH_EN : MAX_LENGTH_MULTILANGUAGE;

  if (text.length > maxLength) {
    const errorMessage =
      locale === 'en'
        ? 'Text exceeds the maximum length of 500 characters'
        : `Text exceeds the maximum length of ${MAX_LENGTH_MULTILANGUAGE} characters for multilingual voice cloning`;
    throw createRouteError(errorMessage, 400, 'errors.textTooLong', {
      MAX: maxLength,
    });
  }
}

function validateFileType(file: File): string {
  const normalizedFileType = file.type.split(';')[0]?.trim().toLowerCase();

  if (!ALLOWED_TYPES.includes(normalizedFileType)) {
    throw createRouteError(
      'Invalid file type. Only MP3, OGG, Opus, M4A, WAV, or WebM allowed.',
      400,
      'errors.invalidFileType',
      { fileType: normalizedFileType },
    );
  }

  return normalizedFileType;
}

function validateFileSize(file: File): void {
  if (file.size > CLONING_FILE_MAX_SIZE) {
    const maxMb = (CLONING_FILE_MAX_SIZE / 1024 / 1024).toFixed(1);
    const errorMessage = `File too large. Max ${maxMb}MB allowed.`;
    throw createRouteError(errorMessage, 413, 'errors.fileTooLarge', {
      MAX_BYTES: CLONING_FILE_MAX_SIZE,
      MAX_MB: maxMb,
    });
  }
}

function validateAudioDuration(
  duration: number | null,
  provider: CloneProvider,
): void {
  if (duration === null) {
    throw createRouteError(
      'Could not determine audio duration.',
      400,
      'errors.audioDurationUnknown',
    );
  }

  const constraints = getCloneProviderConstraints(provider);

  if (
    duration < constraints.minDurationSeconds ||
    duration > constraints.maxDurationSeconds
  ) {
    const errorMessage =
      provider === 'mistral'
        ? `Reference audio must be between ${constraints.minDurationSeconds} and ${constraints.maxDurationSeconds} seconds for voice cloning.`
        : `Audio must be between ${constraints.minDurationSeconds} seconds and ${constraints.maxDurationSeconds / 60} minutes.`;

    throw createRouteError(
      errorMessage,
      400,
      provider === 'mistral'
        ? 'errors.audioDurationInvalidVoxtral'
        : 'errors.audioDurationInvalidFallback',
      {
        MAX: constraints.maxDurationSeconds,
        MAX_MINUTES: constraints.maxDurationSeconds / 60,
        MIN: constraints.minDurationSeconds,
      },
    );
  }
}

function calculateReferenceAudioEnhancementCredits(
  durationSeconds: number | null,
): number {
  if (durationSeconds === null) {
    throw createRouteError(
      'Could not determine audio duration.',
      400,
      'errors.audioDurationUnknown',
    );
  }

  return Math.ceil(
    Math.max(0, durationSeconds) *
      REFERENCE_AUDIO_ENHANCEMENT_CREDITS_PER_SECOND,
  );
}

function getReferenceAudioEnhancementDollarCost(
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

function validateCreditAmount({
  currentAmount,
  requiredCredits,
  text,
  userEmail,
  userId,
}: {
  currentAmount: number;
  requiredCredits: number;
  text: string;
  userEmail?: string;
  userId: string;
}): void {
  if (currentAmount >= requiredCredits) {
    return;
  }

  logger.info('Insufficient credits', {
    user: { id: userId, email: userEmail },
    extra: {
      text,
      estimate: requiredCredits,
      currentCreditsAmount: currentAmount,
    },
  });
  throw createRouteError(
    `Insufficient credits. You need ${requiredCredits} credits to clone this audio`,
    402,
    'errors.insufficientCredits',
    { CREDITS: requiredCredits, currentCredits: currentAmount },
  );
}

function validateReferenceAudioEnhancementInput(
  duration: number | null,
  inputBytes: number,
): void {
  if (duration === null) {
    throw createRouteError(
      'Could not determine audio duration.',
      400,
      'errors.audioDurationUnknown',
    );
  }

  if (duration > REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION) {
    throw createRouteError(
      `Reference audio enhancement supports clips up to ${REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION} seconds.`,
      400,
      'errors.referenceAudioEnhancementInputTooLong',
      {
        MAX: REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION,
      },
    );
  }

  if (inputBytes > REFERENCE_AUDIO_ENHANCEMENT_MAX_INPUT_BYTES) {
    throw createRouteError(
      'Reference audio enhancement input exceeds size limit.',
      400,
      'errors.referenceAudioEnhancementInputTooLarge',
      {
        MAX_BYTES: REFERENCE_AUDIO_ENHANCEMENT_MAX_INPUT_BYTES,
      },
    );
  }
}

function validateLocale(locale: string): void {
  const localeConfig = SUPPORTED_LOCALE_CODES.find((l) => l.code === locale);
  if (!localeConfig) {
    throw createRouteError(
      `Unsupported language for voice cloning: ${locale}. Supported languages are: ${SUPPORTED_LOCALE_CODES.map((l) => l.code).join(', ')}`,
      400,
      'errors.unsupportedLocale',
      { locale },
    );
  }
}

async function validateCredits(
  userId: string,
  text: string,
  userEmail?: string,
): Promise<{ currentAmount: number; estimate: number }> {
  const currentAmount = await getCredits(userId);
  const estimate = estimateCredits(text, 'clone');

  validateCreditAmount({
    currentAmount,
    requiredCredits: estimate,
    text,
    userEmail,
    userId,
  });

  return { currentAmount, estimate };
}

// ============================================================================
// Audio Processing Functions
// ============================================================================

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: large
async function processAudioFile(
  file: File,
  enhancementEnabled: boolean,
  locale: string,
  userId: string,
): Promise<ProcessedCloneInputAudio> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Normalize MIME type (microphone recordings may include codecs params)
  let normalizedMimeType = file.type.split(';')[0]?.trim().toLowerCase();
  let isMicAudio = false;

  // Detect microphone recordings
  const filenameLower = file.name.toLowerCase();
  if (
    normalizedMimeType === 'application/octet-stream' ||
    filenameLower.startsWith('microphone-recording.')
  ) {
    isMicAudio = true;
    if (
      normalizedMimeType === 'application/octet-stream' &&
      !normalizedMimeType.includes('audio/')
    ) {
      normalizedMimeType = 'audio/ogg';
    }
  }

  let processedBuffer = buffer;
  let processedMimeType = normalizedMimeType;

  if (enhancementEnabled) {
    const sourceDuration = await getAudioDuration(buffer, normalizedMimeType);
    validateReferenceAudioEnhancementInput(sourceDuration, buffer.length);
  }

  const provider = resolveCloneProvider(locale);
  const shouldNormalizeToWav = provider === 'mistral' || enhancementEnabled;

  // Convert to WAV for providers that need normalized reference audio
  if (shouldNormalizeToWav && needsConversion(normalizedMimeType)) {
    if (!(isMicAudio || isConversionSupported(normalizedMimeType, file.name))) {
      throw createRouteError(
        'Unsupported audio format for voice cloning. Please use MP3, OGG/OPUS, WEBM, or WAV.',
        400,
        'errors.unsupportedAudioFormat',
        { mimeType: normalizedMimeType },
      );
    }

    try {
      const wavBuffer = await convertToWav(
        buffer,
        normalizedMimeType,
        file.name,
      );

      if (wavBuffer) {
        processedBuffer = wavBuffer as Buffer<ArrayBuffer>;
        processedMimeType = 'audio/wav';

        if (enhancementEnabled) {
          validateReferenceAudioEnhancementInput(
            await getAudioDuration(processedBuffer, processedMimeType),
            processedBuffer.length,
          );
        }

        logger.info('Converted audio to WAV for voice cloning', {
          user: { id: userId },
          extra: {
            enhancementEnabled,
            originalMimeType: file.type,
            locale,
          },
        });
      }
    } catch (conversionError) {
      const errorMessage = Error.isError(conversionError)
        ? conversionError.message
        : 'Unknown error';
      const errorStack = Error.isError(conversionError)
        ? conversionError.stack
        : undefined;

      console.error('Audio conversion failed:', {
        error: errorMessage,
        stack: errorStack,
        normalizedMimeType,
        isMicAudio,
        locale,
        filename: file.name,
        bufferSize: buffer.length,
      });

      captureException(conversionError, {
        user: { id: userId },
        extra: { locale, mimeType: file.type, filename: file.name },
      });

      const errorMsg =
        normalizedMimeType === 'audio/webm' ||
        normalizedMimeType === 'video/webm'
          ? 'WebM audio must be converted to WAV on the client before uploading. Please try recording again.'
          : 'Failed to convert audio format to WAV. Uploaded file must be MP3, OGG, Opus, or WAV';
      const errorCode =
        normalizedMimeType === 'audio/webm' ||
        normalizedMimeType === 'video/webm'
          ? 'errors.audioConversionRequiredWebm'
          : 'errors.audioConversionFailed';

      throw createRouteError(errorMsg, 500, errorCode, {
        mimeType: normalizedMimeType,
      });
    }
  }

  const duration = await getAudioDuration(processedBuffer, processedMimeType);
  const audioHash = await generateBufferHash(processedBuffer);

  return {
    audioHash,
    buffer: processedBuffer,
    mimeType: processedMimeType,
    duration,
  };
}

// ============================================================================
// Voice Generation Functions
// ============================================================================

async function generateVoiceWithMistral(
  text: string,
  referenceAudioBuffer: Buffer,
): Promise<{ buffer: Buffer; modelUsed: string; requestId: string }> {
  const model = 'voxtral-mini-tts-2603';
  const client = getMistralClient();

  const response = await client.audio.speech.complete({
    model,
    input: text,
    refAudio: referenceAudioBuffer.toString('base64'),
    responseFormat: 'wav',
  });

  const audioData = response.audioData;
  if (!audioData) {
    throw new Error('Mistral Voxtral response did not include audio data');
  }

  let buffer: Buffer;
  if (typeof audioData === 'string') {
    buffer = Buffer.from(audioData, 'base64');
  } else {
    buffer = Buffer.from(audioData);
  }

  if (buffer.length === 0) {
    throw new Error('Mistral Voxtral response returned empty audio data');
  }

  const riffHeader = buffer.subarray(0, 4).toString('ascii');
  const waveHeader = buffer.subarray(8, 12).toString('ascii');

  if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
    throw new Error('Mistral Voxtral response did not return a valid WAV file');
  }

  return {
    buffer,
    modelUsed: model,
    requestId: randomUUID(),
  };
}

async function generateVoiceWithReplicate(
  text: string,
  locale: string,
  audioReferenceUrl: string,
): Promise<{ blob: Blob; modelUsed: string; requestId: string }> {
  const localeConfig = SUPPORTED_LOCALE_CODES.find((l) => l.code === locale);
  if (!localeConfig) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  let language = locale;
  if (locale === 'en-multi') {
    language = 'en';
  }

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

  const output = (await replicate.run(
    model,
    { input },
    onProgress,
  )) as ReplicateResponse;

  if (typeof output === 'object' && 'error' in output) {
    const errorObj = {
      text,
      locale,
      language,
      audioReferenceUrl,
      model,
      errorData: output.error,
    };
    const error = new Error(
      output.error || 'Voice cloning failed, please try again',
      {
        cause: 'REPLICATE_ERROR',
      },
    );
    captureException(error, {
      extra: errorObj,
    });
    console.error(errorObj);
    throw new Error(output.error || 'Voice cloning failed, please try again', {
      cause: 'REPLICATE_ERROR',
    });
  }

  const audioBlob = await (output as ReplicateOutput).blob();

  return {
    blob: audioBlob,
    modelUsed: model.split(':')[0],
    requestId: replicateResponse?.id || 'unknown',
  };
}

async function uploadGeneratedAudio(
  audioData: Buffer | Blob,
  filename: string,
  mimeType: string,
): Promise<string> {
  let buffer: Buffer;

  if (audioData instanceof Blob) {
    const arrayBuffer = await audioData.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    buffer = audioData;
  }

  const url = await uploadFileToR2(filename, buffer, mimeType);
  await redis.set(filename, url);

  return url;
}

async function createCloneOutputFilename({
  audioHash,
  basePath,
  enhancementEnabled,
  locale,
  provider,
  text,
}: {
  audioHash: string;
  basePath: string;
  enhancementEnabled: boolean;
  locale: string;
  provider: CloneProvider;
  text: string;
}): Promise<string> {
  const cacheKeyInput = enhancementEnabled
    ? `${locale}-${provider}-${text}-${audioHash}-enhanced`
    : `${locale}-${provider}-${text}-${audioHash}`;
  const hash = await generateHash(cacheKeyInput);

  return `${basePath}/${locale}-${provider}-${hash}.wav`;
}

// ============================================================================
// Background Tasks
// ============================================================================

async function runBackgroundTasks(
  userId: string,
  creditsUsed: number,
  provider: CloneProvider,
  audioFileData: {
    baseCloneCredits: number;
    filename: string;
    referenceAudioEnhancementCredits: number;
    referenceAudioEnhancementDollarAmount: number;
    referenceAudioEnhancementDurationSeconds?: number | null;
    referenceAudioEnhancementModel?: string | null;
    referenceAudioEnhancementRequestId?: string | null;
    referenceAudioEnhanced: boolean;
    text: string;
    url: string;
    modelUsed: string;
    requestId: string;
    duration: number;
    locale: string;
    referenceAudioFileMimeType: string;
    referenceAudioProcessedMimeType: string;
  },
): Promise<void> {
  await reduceCredits({ userId, amount: creditsUsed });

  const userHasPaid = await hasUserPaid(userId);

  const audioFileDBResult = await saveAudioFile({
    userId,
    filename: audioFileData.filename,
    text: audioFileData.text,
    url: audioFileData.url,
    model: audioFileData.modelUsed,
    predictionId: audioFileData.requestId,
    isPublic: false,
    voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
    duration: audioFileData.duration.toFixed(3),
    credits_used: creditsUsed,
    usage: {
      creditsUsed,
    },
  });

  if (audioFileDBResult.error) {
    const errorObj = {
      text: audioFileData.text,
      generatedAudioUrl: audioFileData.url,
      model: audioFileData.modelUsed,
      errorData: audioFileDBResult.error,
    };
    const error = new Error(
      audioFileDBResult.error.message || 'Failed to insert audio file row',
    );
    captureException(error, {
      user: { id: userId },
      extra: errorObj,
    });
    console.error(errorObj);
  }

  // Insert usage event for tracking voice cloning (non-blocking)
  await insertUsageEvent({
    userId,
    sourceType: 'voice_cloning',
    sourceId: audioFileDBResult.data?.id,
    unit: 'operation',
    quantity: 1,
    creditsUsed: audioFileData.baseCloneCredits,
    dollarAmount: getDollarCost(
      provider,
      audioFileData.baseCloneCredits,
      audioFileData.text,
    ),
    metadata: {
      provider,
      model: audioFileData.modelUsed,
      locale: audioFileData.locale,
      textPreview: audioFileData.text.slice(0, 100),
      textLength: audioFileData.text.length,
      audioDuration: audioFileData.duration,
      referenceAudioEnhanced: audioFileData.referenceAudioEnhanced,
      referenceAudioEnhancementModel:
        audioFileData.referenceAudioEnhancementModel,
      referenceAudioEnhancementRequestId:
        audioFileData.referenceAudioEnhancementRequestId,
      referenceAudioFileMimeType: audioFileData.referenceAudioFileMimeType,
      referenceAudioProcessedMimeType:
        audioFileData.referenceAudioProcessedMimeType,
      requestId: audioFileData.requestId,
      userHasPaid,
    },
  });

  if (
    audioFileData.referenceAudioEnhanced &&
    audioFileData.referenceAudioEnhancementCredits > 0
  ) {
    const enhancementDurationSeconds =
      audioFileData.referenceAudioEnhancementDurationSeconds ?? 0;

    await insertUsageEvent({
      userId,
      sourceType: 'audio_processing',
      sourceId: audioFileDBResult.data?.id,
      requestId: audioFileData.referenceAudioEnhancementRequestId ?? undefined,
      model: audioFileData.referenceAudioEnhancementModel ?? undefined,
      unit: 'secs',
      quantity: enhancementDurationSeconds,
      durationSeconds: enhancementDurationSeconds,
      creditsUsed: audioFileData.referenceAudioEnhancementCredits,
      dollarAmount: audioFileData.referenceAudioEnhancementDollarAmount,
      metadata: {
        operation: 'reference_audio_enhancement',
        provider: 'fal',
        model: audioFileData.referenceAudioEnhancementModel,
        voiceCloningRequestId: audioFileData.requestId,
        voiceCloningModel: audioFileData.modelUsed,
        locale: audioFileData.locale,
        referenceAudioFileMimeType: audioFileData.referenceAudioFileMimeType,
        referenceAudioProcessedMimeType:
          audioFileData.referenceAudioProcessedMimeType,
        userHasPaid,
      },
    });
  }

  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'clone-voice',
    properties: {
      provider,
      predictionId: audioFileData.requestId,
      textPreview: audioFileData.text.slice(0, 100),
      model: audioFileData.modelUsed,
      audioDuration: audioFileData.duration,
      referenceAudioEnhanced: audioFileData.referenceAudioEnhanced,
      referenceAudioEnhancementDurationSeconds:
        audioFileData.referenceAudioEnhancementDurationSeconds ?? null,
      referenceAudioEnhancementModel:
        audioFileData.referenceAudioEnhancementModel,
      text: audioFileData.text,
      locale: audioFileData.locale,
      generatedAudioUrl: audioFileData.url,
      credits_used: audioFileData.baseCloneCredits,
      userHasPaid,
    },
  });
  await posthog.shutdown();
}

// ============================================================================
// Main Route Handler
// ============================================================================

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Existing route coordinates validation, enhancement fallback, generation, caching, and billing.
export async function POST(request: Request) {
  let enhancementModelUsed: string | null = null;
  let enhancementRequestId: string | null = null;
  let referenceAudioEnhanced = false;
  let text = '';
  let locale = '';
  let duration: number | null = null;
  let modelUsed = '';
  let referenceAudioFile: File | null = null;

  try {
    // Authentication
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return routeErrorResponse('User not found', 401, 'errors.userNotFound');
    }

    setUser({
      id: user.id,
      email: user.email,
    });

    // Parse and validate request
    const contentType = request.headers.get('content-type') || '';
    validateContentType(contentType);

    const formInput = await parseFormData(request);
    text = formInput.text;
    locale = formInput.locale;
    referenceAudioFile = formInput.file;

    // Validate inputs
    validateTextLength(text, locale);
    validateFileType(referenceAudioFile);
    validateFileSize(referenceAudioFile);
    validateLocale(locale);

    // Check credits
    const { currentAmount, estimate } = await validateCredits(
      user.id,
      text,
      user.email,
    );

    // Process audio file
    const provider = resolveCloneProvider(locale);

    const processedAudio = await processAudioFile(
      referenceAudioFile,
      formInput.enhanceReferenceAudio,
      locale,
      user.id,
    );
    let cloneInputAudio = processedAudio;
    let creditsUsed = estimate;
    let referenceAudioEnhancementCredits = 0;
    let referenceAudioEnhancementDollarAmount = 0;
    let referenceAudioEnhancementDurationSeconds: number | null = null;

    const userHasPaid = await hasUserPaid(user.id);
    const basePath = userHasPaid ? 'cloned-audio' : 'cloned-audio-free';
    let filename = await createCloneOutputFilename({
      audioHash: processedAudio.audioHash,
      basePath,
      enhancementEnabled: formInput.enhanceReferenceAudio,
      locale,
      provider,
      text,
    });

    const cachedOutputUrl = await redis.get<string>(filename);
    if (cachedOutputUrl) {
      return NextResponse.json(
        {
          url: cachedOutputUrl,
          creditsUsed: 0,
          creditsRemaining: currentAmount || 0,
        },
        { status: 200 },
      );
    }

    if (formInput.enhanceReferenceAudio) {
      referenceAudioEnhancementDurationSeconds = processedAudio.duration;
      referenceAudioEnhancementCredits =
        calculateReferenceAudioEnhancementCredits(
          referenceAudioEnhancementDurationSeconds,
        );
      referenceAudioEnhancementDollarAmount =
        getReferenceAudioEnhancementDollarCost(
          referenceAudioEnhancementDurationSeconds,
        );

      validateCreditAmount({
        currentAmount,
        requiredCredits: estimate + referenceAudioEnhancementCredits,
        text,
        userEmail: user.email,
        userId: user.id,
      });

      try {
        const enhancedAudio = await enhanceReferenceAudio({
          abortSignal: request.signal,
          buffer: processedAudio.buffer,
          filename: referenceAudioFile.name,
          mimeType: processedAudio.mimeType,
        });

        enhancementModelUsed = enhancedAudio.modelUsed;
        enhancementRequestId = enhancedAudio.requestId;
        referenceAudioEnhanced = true;
        creditsUsed = estimate + referenceAudioEnhancementCredits;

        cloneInputAudio = {
          audioHash: await generateBufferHash(enhancedAudio.buffer),
          buffer: enhancedAudio.buffer,
          duration: await getAudioDuration(
            enhancedAudio.buffer,
            enhancedAudio.mimeType,
          ),
          mimeType: enhancedAudio.mimeType,
          publicUrl: enhancedAudio.publicUrl,
        };
      } catch (enhancementError) {
        captureException(enhancementError, {
          user: { id: user.id },
          extra: {
            locale,
            mimeType: processedAudio.mimeType,
            filename: referenceAudioFile.name,
          },
        });
        logger.info(
          'Reference audio enhancement failed; using original audio',
          {
            user: { id: user.id },
            extra: {
              locale,
              mimeType: processedAudio.mimeType,
              filename: referenceAudioFile.name,
            },
          },
        );

        filename = await createCloneOutputFilename({
          audioHash: processedAudio.audioHash,
          basePath,
          enhancementEnabled: false,
          locale,
          provider,
          text,
        });
        creditsUsed = estimate;
        referenceAudioEnhancementCredits = 0;
        referenceAudioEnhancementDollarAmount = 0;
        referenceAudioEnhancementDurationSeconds = null;

        const fallbackCachedOutputUrl = await redis.get<string>(filename);
        if (fallbackCachedOutputUrl) {
          return NextResponse.json(
            {
              url: fallbackCachedOutputUrl,
              creditsUsed: 0,
              creditsRemaining: currentAmount || 0,
            },
            { status: 200 },
          );
        }
      }
    }

    validateAudioDuration(cloneInputAudio.duration, provider);
    duration = cloneInputAudio.duration;

    // Generate voice
    let outputUrl: string;
    let requestId: string;

    if (provider === 'mistral') {
      const result = await generateVoiceWithMistral(
        text,
        cloneInputAudio.buffer,
      );

      outputUrl = await uploadGeneratedAudio(
        result.buffer,
        filename,
        'audio/wav',
      );

      modelUsed = result.modelUsed;
      requestId = result.requestId;
    } else {
      const referenceAudioFilename = sanitizeFilename(referenceAudioFile.name);
      const processedFilename =
        cloneInputAudio.mimeType === 'audio/wav' &&
        !referenceAudioFilename.endsWith('.wav')
          ? `${referenceAudioFilename.replace(/\.[^/.]+$/, '')}.wav`
          : referenceAudioFilename;

      const blobUrl = `clone-voice-input/${user.id}-${cloneInputAudio.audioHash}-${processedFilename}`;

      const referenceAudioUrl = await uploadFileToR2(
        blobUrl,
        cloneInputAudio.buffer,
        cloneInputAudio.mimeType,
      );

      const result = await generateVoiceWithReplicate(
        text,
        locale,
        referenceAudioUrl,
      );

      outputUrl = await uploadGeneratedAudio(
        result.blob,
        filename,
        'audio/wav',
      );

      modelUsed = result.modelUsed;
      requestId = result.requestId;
    }

    // Background tasks
    after(async () => {
      await runBackgroundTasks(user.id, creditsUsed, provider, {
        baseCloneCredits: estimate,
        filename,
        referenceAudioEnhancementCredits,
        referenceAudioEnhancementDollarAmount,
        referenceAudioEnhancementDurationSeconds,
        referenceAudioEnhanced,
        referenceAudioEnhancementModel: enhancementModelUsed,
        referenceAudioEnhancementRequestId: enhancementRequestId,
        text,
        url: outputUrl,
        modelUsed,
        requestId,
        duration: duration as number,
        locale,
        referenceAudioFileMimeType: referenceAudioFile?.type || '',
        referenceAudioProcessedMimeType: cloneInputAudio.mimeType,
      });
    });

    return NextResponse.json(
      {
        url: outputUrl,
        creditsUsed,
        creditsRemaining: (currentAmount || 0) - creditsUsed,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof RouteError) {
      return routeErrorResponse(
        error.serverMessage,
        error.status,
        error.code,
        error.details,
      );
    }

    const errorObj = {
      text,
      locale,
      errorData: error,
    };
    captureException(error, {
      extra: errorObj,
    });

    if (Error.isError(error) && 'body' in error) {
      console.error(
        'Validation error details:',
        JSON.stringify(error.body, null, 2),
      );
    } else {
      console.error(errorObj);
    }

    const serverMessage = Error.isError(error) ? error.message : String(error);

    return NextResponse.json(
      {
        error: serverMessage,
        serverMessage,
        status: 500,
        code: 'errors.internalError',
      },
      { status: 500 },
    );
  }
}
