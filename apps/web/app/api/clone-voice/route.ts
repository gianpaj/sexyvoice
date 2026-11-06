import { randomUUID } from 'node:crypto';
import { captureException, logger, setUser } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';
import { z } from 'zod';

import { generateHash, getAudioDuration } from '@/lib/audio';
import {
  AudioDecodeError,
  convertToWav,
  isConversionSupported,
  needsConversion,
  trimWavBuffer,
} from '@/lib/audio-converter';
import { CLONED_VOICE_ID } from '@/lib/call-voices';
import {
  CLONE_FORM_FIELDS,
  type CloneErrorResponseBody,
  type CloneRouteErrorCode,
  type CloneSuccessResponse,
  type RouteErrorDetails,
} from '@/lib/clone/api-types';
import { getCallCloneProvider } from '@/lib/clone/call-clone-provider';
import {
  MAX_SAVED_CALL_VOICES,
  savedVoiceProvider,
  supportsCallCloneLocale,
} from '@/lib/clone/call-voice-config';
import {
  CHATTERBOX_SUPPORTED_LOCALE_CODES,
  CLONE_SUPPORTED_LOCALE_CODES,
  resolveBaseCloneLocale,
} from '@/lib/clone/constants';
import { saveInworldVoice, synthesizeInworldSpeech } from '@/lib/clone/inworld';
import { getMistralClient, saveMistralVoice } from '@/lib/clone/mistral';
import { cloneProviderCost, estimateCloneCredits } from '@/lib/clone/pricing';
import {
  CLONE_PROVIDERS,
  type CloneProvider,
  cloneTextLimit,
  oneOffCloneProvider,
} from '@/lib/clone/providers';
import { enhanceReferenceAudio } from '@/lib/clone/reference-audio-enhancement';
import {
  type CreditReservation,
  reserveCredits,
} from '@/lib/credits/reservation';
import { getProviderUnavailableMessage } from '@/lib/errors/provider-unavailable-message';
import { getFalBillingEventCost } from '@/lib/fal-billing';
import PostHogClient from '@/lib/posthog';
import {
  getProviderErrorMessage,
  getProviderErrorName,
  getProviderStatusCode,
  getProviderUnavailableDetails,
  isTransientProviderFailure,
} from '@/lib/provider-errors';
import { audioFolder } from '@/lib/storage/layout';
import { uploadFileToR2 } from '@/lib/storage/upload';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import {
  countSavedCallVoices,
  getOwnedCallVoice,
} from '@/lib/supabase/call-voices';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import {
  getCredits,
  hasUserPaid,
  insertUsageEvent,
  isInsufficientCreditsError,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

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

const CHATTERBOX_VERSION =
  '9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c';
const REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION = 60;
const REFERENCE_AUDIO_ENHANCEMENT_MAX_INPUT_BYTES = 25 * 1024 * 1024;
const REFERENCE_AUDIO_ENHANCEMENT_CREDITS_PER_SECOND = 10;
const REFERENCE_AUDIO_ENHANCEMENT_DOLLARS_PER_SECOND = 0.001;

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

interface ProcessedCloneInputAudio {
  audioHash: string;
  buffer: Buffer;
  duration: number | null;
  mimeType: string;
  originalDuration: number | null;
  wasTrimmed: boolean;
}

interface FormInput {
  enhanceReferenceAudio: boolean;
  file: File | null;
  locale: string;
  /** Speak with a saved voice instead of cloning from `file`. */
  savedVoiceId?: string;
  saveVoiceName?: string;
  text: string;
}

interface CloneUser {
  email?: string;
  id: string;
}

/** A fal.ai enhancement the clone used and charges for. */
interface AppliedEnhancement {
  credits: number;
  dollarAmount: number;
  durationSeconds: number | null;
  model: string;
  requestId: string;
}

interface MistralSdkErrorLike {
  body?: unknown;
  message?: unknown;
  statusCode?: unknown;
}

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
  // biome-ignore lint/plugin: clone-voice intentionally returns a structured error body ({ error, serverMessage, status, code, details }) that its client and tests depend on; APIErrorResponse doesn't carry the route-specific `code`.
  return NextResponse.json(
    {
      code,
      details,
      error: `${serverMessage} (${status})`,
      serverMessage,
      status,
    } satisfies CloneErrorResponseBody,
    { status },
  );
}

function createProviderUnavailableRouteError(
  provider: CloneProvider,
): RouteError {
  return createRouteError(
    getProviderUnavailableMessage(provider),
    503,
    'PROVIDER_UNAVAILABLE',
    { provider: getProviderUnavailableDetails(provider).provider },
  );
}

/** Report a transient provider failure as PROVIDER_UNAVAILABLE. */
async function withProviderAvailability<T>(
  provider: CloneProvider,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof RouteError) && isTransientProviderFailure(error)) {
      logger.warn('Voice cloning provider unavailable', {
        extra: {
          errorMessage: getProviderErrorMessage(error),
          errorName: getProviderErrorName(error),
          provider,
          statusCode: getProviderStatusCode(error),
        },
      });
      throw createProviderUnavailableRouteError(provider);
    }
    throw error;
  }
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
  // Identical uploads produce the same cache key, so R2/Redis entries are
  // reused instead of depending on timestamps.
  const data = new Uint8Array(buffer);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cloneSuccessResponse(
  url: string,
  currentAmount: number,
  creditsUsed: number,
) {
  return NextResponse.json(
    {
      creditsRemaining: (currentAmount || 0) - creditsUsed,
      creditsUsed,
      url,
    } satisfies CloneSuccessResponse,
    { status: 200 },
  );
}

// ============================================================================
// Validation Functions
// ============================================================================

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

  const enhanceReferenceAudioValue = formData.get(
    CLONE_FORM_FIELDS.enhanceReferenceAudio,
  );
  const nameValue = formData.get(CLONE_FORM_FIELDS.saveVoiceName);
  const saveVoiceName =
    typeof nameValue === 'string' ? nameValue.trim() : undefined;
  if (
    nameValue !== null &&
    (!saveVoiceName ||
      saveVoiceName.length > 50 ||
      formData.get(CLONE_FORM_FIELDS.voiceConsent) !== 'true')
  ) {
    throw createRouteError(
      'A voice name and permission to save are required',
      400,
      'errors.voiceNameAndConsentRequired',
    );
  }
  const textValue = formData.get(CLONE_FORM_FIELDS.text);
  const file = formData.get(CLONE_FORM_FIELDS.file);
  const locale = formData.get(CLONE_FORM_FIELDS.locale);

  const text = typeof textValue === 'string' ? textValue : '';
  const audioFile = file instanceof File ? file : null;
  const shouldEnhanceReferenceAudio =
    typeof enhanceReferenceAudioValue === 'string' &&
    enhanceReferenceAudioValue === 'true';
  const localeStr = typeof locale === 'string' ? locale : '';

  const savedVoiceValue = formData.get(CLONE_FORM_FIELDS.savedVoiceId);
  const savedVoiceId =
    typeof savedVoiceValue === 'string' && savedVoiceValue
      ? savedVoiceValue
      : undefined;
  if (
    savedVoiceId &&
    (saveVoiceName || !z.uuid().safeParse(savedVoiceId).success)
  ) {
    throw createRouteError(
      'Invalid saved voice',
      400,
      'errors.missingRequiredParameters',
    );
  }

  if (!((text || saveVoiceName) && (audioFile || savedVoiceId))) {
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
    saveVoiceName,
    enhanceReferenceAudio: shouldEnhanceReferenceAudio,
    file: audioFile,
    locale: localeStr,
    savedVoiceId,
    text,
  };
}

function validateTextLength(
  text: string,
  provider: CloneProvider,
  userHasPaid: boolean,
): void {
  const maxLength = cloneTextLimit(provider, userHasPaid);
  if (text.length <= maxLength) {
    return;
  }

  throw createRouteError(
    `Text exceeds the maximum length of ${maxLength} characters`,
    400,
    'errors.textTooLong',
    { MAX: maxLength },
  );
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

function isWebmMimeType(mimeType: string): boolean {
  return mimeType === 'audio/webm' || mimeType === 'video/webm';
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

  const minSeconds = CLONE_PROVIDERS[provider].minReferenceSeconds;

  if (duration < minSeconds) {
    if (provider !== 'replicate') {
      throw createRouteError(
        `Reference audio must be at least ${minSeconds} seconds for voice cloning.`,
        400,
        'errors.audioDurationInvalidVoxtral',
        {
          MIN: minSeconds,
        },
      );
    }

    throw createRouteError(
      `Audio must be at least ${minSeconds} seconds.`,
      400,
      'errors.audioDurationInvalidFallback',
      {
        MIN: minSeconds,
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
    extra: {
      currentCreditsAmount: currentAmount,
      estimate: requiredCredits,
      text,
    },
    user: { email: userEmail, id: userId },
  });
  throw createRouteError(
    `Insufficient credits. You need ${requiredCredits} credits to clone this audio`,
    402,
    'errors.insufficientCredits',
    { CREDITS: requiredCredits, currentCredits: currentAmount },
  );
}

async function reserveCloneCredits({
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
}): Promise<CreditReservation> {
  try {
    return await reserveCredits({
      actor: 'session',
      amount: requiredCredits,
      userId,
    });
  } catch (error) {
    if (!isInsufficientCreditsError(error)) {
      throw error;
    }

    logger.info('Insufficient credits during clone reservation', {
      extra: {
        currentCreditsAmount: currentAmount,
        estimate: requiredCredits,
        text,
      },
      user: { email: userEmail, id: userId },
    });
    throw createRouteError(
      `Insufficient credits. You need ${requiredCredits} credits to clone this audio`,
      402,
      'errors.insufficientCredits',
      { CREDITS: requiredCredits, currentCredits: currentAmount },
    );
  }
}

/** Reserve credits and run the charged work, refunding them when it throws. */
async function withReservedCredits(
  request: Parameters<typeof reserveCloneCredits>[0],
  work: (reservation: CreditReservation) => Promise<Response>,
): Promise<Response> {
  const reservation = await reserveCloneCredits(request);
  try {
    return await work(reservation);
  } catch (error) {
    await reservation.release('clone_voice_failure');
    throw error;
  }
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
  if (!CLONE_SUPPORTED_LOCALE_CODES.has(locale)) {
    throw createRouteError(
      `Unsupported language for voice cloning: ${locale}. Supported languages are: ${[...CLONE_SUPPORTED_LOCALE_CODES].join(', ')}`,
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
  const estimate = estimateCloneCredits(text);

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

async function processAudioFile(
  file: File,
  {
    enhancementEnabled,
    locale,
    provider,
    userId,
  }: {
    enhancementEnabled: boolean;
    locale: string;
    provider: CloneProvider;
    userId: string;
  },
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

  let processedBuffer: Buffer = buffer;
  let processedMimeType = normalizedMimeType;
  let sourceDuration = await getAudioDuration(buffer, normalizedMimeType);
  let wasTrimmed = false;

  const canNormalizeToWav = isConversionSupported(
    normalizedMimeType,
    file.name,
  );
  const shouldNormalizeToWav =
    provider !== 'replicate' || enhancementEnabled || canNormalizeToWav;

  // Convert to WAV for providers that need normalized reference audio
  if (shouldNormalizeToWav && needsConversion(normalizedMimeType)) {
    if (isWebmMimeType(normalizedMimeType)) {
      logger.info('Rejected WebM reference audio before server conversion', {
        extra: {
          bufferSize: buffer.length,
          filename: file.name,
          isMicAudio,
          locale,
          normalizedMimeType,
        },
        user: { id: userId },
      });

      throw createRouteError(
        'WebM audio must be converted to WAV on the client before uploading. Please record again or upload a different audio format (MP3, OGG, Opus, or WAV).',
        400,
        'errors.audioConversionRequiredWebm',
        { mimeType: normalizedMimeType },
      );
    }

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

        logger.info('Converted audio to WAV for voice cloning', {
          extra: {
            enhancementEnabled,
            locale,
            originalMimeType: file.type,
          },
          user: { id: userId },
        });
      }
    } catch (conversionError) {
      const errorMessage = Error.isError(conversionError)
        ? conversionError.message
        : 'Unknown error';
      const errorStack = Error.isError(conversionError)
        ? conversionError.stack
        : undefined;

      logger.info('Audio conversion rejected uploaded reference audio', {
        extra: {
          bufferSize: buffer.length,
          error: errorMessage,
          filename: file.name,
          isMicAudio,
          locale,
          normalizedMimeType,
        },
        user: { id: userId },
      });

      if (!(conversionError instanceof AudioDecodeError)) {
        console.error('Audio conversion failed:', {
          bufferSize: buffer.length,
          error: errorMessage,
          filename: file.name,
          isMicAudio,
          locale,
          normalizedMimeType,
          stack: errorStack,
        });

        captureException(conversionError, {
          extra: { filename: file.name, locale, mimeType: file.type },
          user: { id: userId },
        });
      }

      throw createRouteError(
        'Failed to convert audio format to WAV. Uploaded file must be MP3, OGG, Opus, or WAV',
        400,
        'errors.audioConversionFailed',
        {
          mimeType: normalizedMimeType,
        },
      );
    }
  }

  let duration = await getAudioDuration(processedBuffer, processedMimeType);
  sourceDuration ??= duration;

  const referenceAudioMaxDuration =
    CLONE_PROVIDERS[provider].maxReferenceSeconds;

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

      logger.info('Trimmed reference audio for voice cloning', {
        extra: {
          locale,
          maxDuration: referenceAudioMaxDuration,
          originalDuration: sourceDuration,
          provider,
          trimmedDuration: duration,
        },
        user: { id: userId },
      });
    } else if (provider !== 'replicate') {
      throw createRouteError(
        'Failed to trim reference audio for voice cloning.',
        400,
        'errors.audioConversionFailed',
      );
    }
  }

  if (enhancementEnabled) {
    validateReferenceAudioEnhancementInput(duration, processedBuffer.length);
  }

  const audioHash = await generateBufferHash(processedBuffer);

  return {
    audioHash,
    buffer: processedBuffer,
    duration,
    mimeType: processedMimeType,
    originalDuration: sourceDuration,
    wasTrimmed,
  };
}

function getMistralErrorPayload(error: unknown): {
  body?: string;
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
      body,
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
    return { body, message, statusCode };
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

function isExpectedReferenceAudioEnhancementFailure(error: unknown): boolean {
  const errorName = getProviderErrorName(error);
  const errorMessage = getProviderErrorMessage(error).toLowerCase();

  return (
    errorName === 'TimeoutError' ||
    isTransientProviderFailure(error) ||
    (errorName === 'ValidationError' &&
      errorMessage.includes('unprocessable entity')) ||
    errorMessage.includes('aborted due to timeout')
  );
}

/**
 * Clean the reference with fal.ai. Returns null when enhancement fails, so
 * the clone falls back to the original reference.
 */
async function enhanceReference(
  processedAudio: ProcessedCloneInputAudio,
  file: File,
  {
    locale,
    signal,
    userId,
  }: { locale: string; signal: AbortSignal; userId: string },
): Promise<{
  input: ProcessedCloneInputAudio;
  model: string;
  requestId: string;
} | null> {
  try {
    const enhancedAudio = await enhanceReferenceAudio({
      abortSignal: signal,
      buffer: processedAudio.buffer,
      filename: file.name,
      mimeType: processedAudio.mimeType,
    });
    return {
      input: {
        audioHash: await generateBufferHash(enhancedAudio.buffer),
        buffer: enhancedAudio.buffer,
        duration: await getAudioDuration(
          enhancedAudio.buffer,
          enhancedAudio.mimeType,
        ),
        mimeType: enhancedAudio.mimeType,
        originalDuration: processedAudio.originalDuration,
        wasTrimmed: processedAudio.wasTrimmed,
      },
      model: enhancedAudio.modelUsed,
      requestId: enhancedAudio.requestId,
    };
  } catch (enhancementError) {
    const expectedEnhancementFailure =
      isExpectedReferenceAudioEnhancementFailure(enhancementError);

    if (!expectedEnhancementFailure) {
      captureException(enhancementError, {
        extra: {
          filename: file.name,
          locale,
          mimeType: processedAudio.mimeType,
        },
        user: { id: userId },
      });
    }
    logger.info('Reference audio enhancement failed; using original audio', {
      extra: {
        errorMessage: getProviderErrorMessage(enhancementError),
        errorName: getProviderErrorName(enhancementError),
        expectedEnhancementFailure,
        filename: file.name,
        locale,
        mimeType: processedAudio.mimeType,
      },
      user: { id: userId },
    });
    return null;
  }
}

// ============================================================================
// Voice Generation Functions
// ============================================================================

async function generateVoiceWithMistral(
  text: string,
  voice: { referenceAudio: Buffer } | { voiceId: string },
): Promise<{ buffer: Buffer; modelUsed: string; requestId: string }> {
  const model = CLONE_PROVIDERS.mistral.model;
  const client = getMistralClient();

  let response: Awaited<ReturnType<typeof client.audio.speech.complete>>;
  try {
    response = await client.audio.speech.complete({
      input: text,
      model,
      ...('voiceId' in voice
        ? { voiceId: voice.voiceId }
        : { refAudio: voice.referenceAudio.toString('base64') }),
      responseFormat: 'wav',
    });
  } catch (error) {
    if (isMistralGuardrailError(error)) {
      const payload = getMistralErrorPayload(error);
      logger.info('Mistral guardrail blocked voice cloning request', {
        extra: {
          code: payload.code ?? null,
          model,
          rawStatusCode: payload.rawStatusCode ?? null,
          statusCode: payload.statusCode ?? null,
          type: payload.type ?? null,
        },
      });

      throw createRouteError(
        'This request was blocked by a third-party voice cloning safety policy. Please try different text or a different reference audio.',
        403,
        'errors.guardrailViolation',
        { provider: 'mistral' },
      );
    }

    if (isTransientProviderFailure(error)) {
      logger.warn('Mistral voice cloning provider unavailable', {
        extra: {
          errorMessage: getProviderErrorMessage(error),
          errorName: getProviderErrorName(error),
          model,
          statusCode: getProviderStatusCode(error),
        },
      });
      throw createProviderUnavailableRouteError('mistral');
    }

    throw error;
  }

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

async function cloneVoiceWithReplicate(
  text: string,
  locale: string,
  audioReferenceUrl: string,
): Promise<{ blob: Blob; modelUsed: string; requestId: string }> {
  const language = resolveBaseCloneLocale(locale);
  if (!CHATTERBOX_SUPPORTED_LOCALE_CODES.has(language)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const replicate = new Replicate();
  let replicateResponse: Prediction | undefined;

  const onProgress = (prediction: Prediction) => {
    replicateResponse = prediction;
  };

  const model =
    `${CLONE_PROVIDERS.replicate.model}:${CHATTERBOX_VERSION}` as `${string}/${string}`;
  const input = {
    cfg_weight: 0.5,
    exaggeration: 0.5,
    language,
    reference_audio: audioReferenceUrl,
    seed: 0,
    temperature: 0.8,
    text,
  };

  let output: ReplicateResponse;
  try {
    output = (await replicate.run(
      model,
      { input },
      onProgress,
    )) as ReplicateResponse;
  } catch (error) {
    if (isTransientProviderFailure(error)) {
      logger.warn('Replicate voice cloning provider unavailable', {
        extra: {
          errorMessage: getProviderErrorMessage(error),
          errorName: getProviderErrorName(error),
          language,
          locale,
          model,
        },
      });
      throw createProviderUnavailableRouteError('replicate');
    }

    throw error;
  }

  if (output && typeof output === 'object' && 'error' in output) {
    logger.warn('Replicate voice cloning provider failed', {
      extra: {
        errorMessage: output.error || null,
        language,
        locale,
        model,
      },
    });
    throw createProviderUnavailableRouteError('replicate');
  }

  const audioBlob = await (output as ReplicateOutput).blob();

  return {
    blob: audioBlob,
    modelUsed: CLONE_PROVIDERS.replicate.model,
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
  provider: 'mistral' | 'replicate';
  text: string;
}): Promise<string> {
  const providerCacheKey =
    provider === 'mistral'
      ? `${provider}-${CLONE_PROVIDERS.mistral.model}`
      : provider;
  const cacheKeyInput = enhancementEnabled
    ? `${locale}-${providerCacheKey}-${text}-${audioHash}-enhanced`
    : `${locale}-${providerCacheKey}-${text}-${audioHash}`;
  const hash = await generateHash(cacheKeyInput);

  return `${basePath}/${locale}-${providerCacheKey}-${hash}.wav`;
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
    savedVoiceId?: string;
    filename: string;
    referenceAudioEnhancementCredits: number;
    referenceAudioEnhancementDollarAmount: number;
    referenceAudioEnhancementDurationSeconds?: number | null;
    referenceAudioEnhancementModel?: string | null;
    referenceAudioEnhancementRequestId?: string | null;
    referenceAudioEnhanced: boolean;
    referenceAudioOriginalDurationSeconds?: number | null;
    referenceAudioTrimmed: boolean;
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
  const userHasPaid = await hasUserPaid(userId);

  const audioFileDBResult = await saveAudioFile({
    credits_used: creditsUsed,
    duration: audioFileData.duration.toFixed(3),
    filename: audioFileData.filename,
    isPublic: false,
    model: audioFileData.modelUsed,
    predictionId: audioFileData.requestId,
    text: audioFileData.text,
    url: audioFileData.url,
    usage: {
      creditsUsed,
    },
    userId,
    voiceId: CLONED_VOICE_ID,
  });

  if (audioFileDBResult.error) {
    const errorObj = {
      errorData: audioFileDBResult.error,
      generatedAudioUrl: audioFileData.url,
      model: audioFileData.modelUsed,
      text: audioFileData.text,
    };
    const error = new Error(
      audioFileDBResult.error.message || 'Failed to insert audio file row',
    );
    captureException(error, {
      extra: errorObj,
      user: { id: userId },
    });
    console.error(errorObj);
  }

  // Insert usage event for tracking voice cloning (non-blocking)
  await insertUsageEvent({
    creditsUsed: audioFileData.baseCloneCredits,
    dollarAmount: cloneProviderCost(provider, audioFileData.text),
    metadata: {
      audioDuration: audioFileData.duration,
      locale: audioFileData.locale,
      model: audioFileData.modelUsed,
      provider,
      referenceAudioEnhancementRequestId:
        audioFileData.referenceAudioEnhancementRequestId,
      referenceAudioFileMimeType: audioFileData.referenceAudioFileMimeType,
      referenceAudioOriginalDurationSeconds:
        audioFileData.referenceAudioOriginalDurationSeconds,
      referenceAudioProcessedMimeType:
        audioFileData.referenceAudioProcessedMimeType,
      referenceAudioTrimmed: audioFileData.referenceAudioTrimmed,
      requestId: audioFileData.requestId,
      savedVoiceId: audioFileData.savedVoiceId,
      textLength: audioFileData.text.length,
      textPreview: audioFileData.text.slice(0, 100),
      userHasPaid,
    },
    model: audioFileData.modelUsed,
    quantity: 1,
    requestId: audioFileData.requestId,
    sourceId: audioFileDBResult.data?.id,
    sourceType: 'voice_cloning',
    unit: 'operation',
    userId,
  });

  if (
    audioFileData.referenceAudioEnhanced &&
    audioFileData.referenceAudioEnhancementCredits > 0
  ) {
    const enhancementDurationSeconds =
      audioFileData.referenceAudioEnhancementDurationSeconds ?? 0;

    const actualDollarAmount = audioFileData.referenceAudioEnhancementRequestId
      ? await getFalBillingEventCost(
          audioFileData.referenceAudioEnhancementRequestId,
        )
      : null;

    await insertUsageEvent({
      creditsUsed: audioFileData.referenceAudioEnhancementCredits,
      dollarAmount:
        actualDollarAmount ??
        audioFileData.referenceAudioEnhancementDollarAmount,
      durationSeconds: enhancementDurationSeconds,
      metadata: {
        locale: audioFileData.locale,
        model: audioFileData.referenceAudioEnhancementModel,
        operation: 'reference_audio_enhancement',
        provider: 'fal',
        referenceAudioProcessedMimeType:
          audioFileData.referenceAudioProcessedMimeType,
        referenceAudioTrimmed: audioFileData.referenceAudioTrimmed,
        userHasPaid,
        voiceCloningRequestId: audioFileData.requestId,
      },
      model: audioFileData.referenceAudioEnhancementModel ?? undefined,
      quantity: enhancementDurationSeconds,
      requestId: audioFileData.referenceAudioEnhancementRequestId ?? undefined,
      sourceId: audioFileDBResult.data?.id,
      sourceType: 'audio_processing',
      unit: 'secs',
      userId,
    });
  }

  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'clone-voice',
    properties: {
      audioDuration: audioFileData.duration,
      credits_used:
        audioFileData.baseCloneCredits +
        (audioFileData.referenceAudioEnhancementCredits ?? 0),
      generatedAudioUrl: audioFileData.url,
      locale: audioFileData.locale,
      model: audioFileData.modelUsed,
      predictionId: audioFileData.requestId,
      provider,
      referenceAudioEnhanced: audioFileData.referenceAudioEnhanced,
      referenceAudioEnhancementDurationSeconds:
        audioFileData.referenceAudioEnhancementDurationSeconds ?? null,
      referenceAudioEnhancementModel:
        audioFileData.referenceAudioEnhancementModel,
      referenceAudioOriginalDurationSeconds:
        audioFileData.referenceAudioOriginalDurationSeconds ?? null,
      referenceAudioTrimmed: audioFileData.referenceAudioTrimmed,
      text: audioFileData.text,
      textPreview: audioFileData.text.slice(0, 100),
      userHasPaid,
    },
  });
  await posthog.shutdown();
}

// ============================================================================
// Use cases
// ============================================================================

/** Speak `text` with one of the user's saved voices. */
async function speakWithSavedVoice(
  formInput: FormInput & { savedVoiceId: string },
  user: CloneUser,
): Promise<Response> {
  const { text } = formInput;
  const voice = await getOwnedCallVoice(formInput.savedVoiceId, user.id);
  if (!voice) {
    return routeErrorResponse(
      'Saved voice not found',
      404,
      'errors.savedVoiceNotFound',
    );
  }
  const provider = savedVoiceProvider(voice.provider);
  // Inworld voices speak any call language; Mistral voices keep theirs.
  let { locale } = formInput;
  if (provider === 'mistral') {
    locale = voice.locale ?? locale;
  } else if (!supportsCallCloneLocale(provider, locale)) {
    return routeErrorResponse(
      'This language is not supported for saved voices',
      400,
      'errors.savedVoiceLocaleUnsupported',
    );
  }
  // Saved voices belong to paid users, so they get the paid text limit.
  validateTextLength(text, provider, true);
  const { currentAmount, estimate } = await validateCredits(
    user.id,
    text,
    user.email,
  );
  // The model is in the key, like one-shot clones, so a model switch
  // never serves audio from the previous model.
  const filename = `${audioFolder('clone', true)}/${locale}-${provider}-${CLONE_PROVIDERS[provider].model}-${await generateHash(`${voice.voice_id}-${text}`)}.wav`;
  const cachedOutputUrl = await redis.get<string>(filename);
  if (cachedOutputUrl) {
    return cloneSuccessResponse(cachedOutputUrl, currentAmount, 0);
  }

  return withReservedCredits(
    {
      currentAmount,
      requiredCredits: estimate,
      text,
      userEmail: user.email,
      userId: user.id,
    },
    async (reservation) => {
      const { buffer, modelUsed, requestId } =
        provider === 'inworld'
          ? {
              buffer: await withProviderAvailability('inworld', () =>
                synthesizeInworldSpeech(voice.voice_id, text, locale),
              ),
              modelUsed: CLONE_PROVIDERS.inworld.model,
              requestId: randomUUID(),
            }
          : await generateVoiceWithMistral(text, { voiceId: voice.voice_id });
      const outputUrl = await uploadGeneratedAudio(
        buffer,
        filename,
        'audio/wav',
      );
      const audioDuration = (await getAudioDuration(buffer, 'audio/wav')) ?? 0;
      await reservation.settle(estimate, 'clone_voice_success');
      after(async () => {
        await runBackgroundTasks(user.id, estimate, provider, {
          baseCloneCredits: estimate,
          duration: audioDuration,
          filename,
          locale,
          modelUsed,
          referenceAudioEnhanced: false,
          referenceAudioEnhancementCredits: 0,
          referenceAudioEnhancementDollarAmount: 0,
          referenceAudioFileMimeType: '',
          referenceAudioProcessedMimeType: '',
          referenceAudioTrimmed: false,
          requestId,
          savedVoiceId: voice.id,
          text,
          url: outputUrl,
        });
      });
      return cloneSuccessResponse(outputUrl, currentAmount, estimate);
    },
  );
}

/** Save the reference as a reusable voice for calls. Saving charges no credits. */
async function saveVoice(
  formInput: FormInput & { saveVoiceName: string },
  file: File,
  user: CloneUser,
  userHasPaid: boolean,
): Promise<Response> {
  const { locale } = formInput;
  if (!userHasPaid) {
    return routeErrorResponse(
      'Saved voices require a paid account',
      403,
      'errors.savedVoiceRequiresPaid',
    );
  }
  if ((await countSavedCallVoices(user.id)) >= MAX_SAVED_CALL_VOICES) {
    return routeErrorResponse(
      'Saved voice limit reached',
      403,
      'errors.savedVoiceLimitReached',
      { MAX: MAX_SAVED_CALL_VOICES },
    );
  }
  const provider = getCallCloneProvider();
  if (!supportsCallCloneLocale(provider, locale)) {
    return routeErrorResponse(
      'This language is not supported for saved voices',
      400,
      'errors.savedVoiceLocaleUnsupported',
    );
  }
  const processedAudio = await processAudioFile(file, {
    enhancementEnabled: false,
    locale,
    provider,
    userId: user.id,
  });
  validateAudioDuration(processedAudio.duration, provider);
  const reference = await withProviderAvailability(provider, () =>
    provider === 'inworld'
      ? saveInworldVoice(
          processedAudio.buffer,
          formInput.saveVoiceName,
          locale,
          user.id,
          // The same checkbox asks Inworld for free noise removal.
          { removeBackgroundNoise: formInput.enhanceReferenceAudio },
        )
      : saveMistralVoice(
          processedAudio.buffer,
          formInput.saveVoiceName,
          locale,
          user.id,
        ),
  );
  return NextResponse.json({
    audioReferenceId: reference.id,
    provider,
  });
}

/** Speak `text` once in the voice of the uploaded reference audio. */
async function cloneOnce(
  formInput: FormInput,
  file: File,
  user: CloneUser,
  userHasPaid: boolean,
  signal: AbortSignal,
): Promise<Response> {
  const { locale, text } = formInput;
  const provider = oneOffCloneProvider(locale);
  validateTextLength(text, provider, userHasPaid);

  const { currentAmount, estimate } = await validateCredits(
    user.id,
    text,
    user.email,
  );

  const processedAudio = await processAudioFile(file, {
    enhancementEnabled: formInput.enhanceReferenceAudio,
    locale,
    provider,
    userId: user.id,
  });

  const basePath = audioFolder('clone', userHasPaid);
  const outputFilename = (enhancementEnabled: boolean) =>
    createCloneOutputFilename({
      audioHash: processedAudio.audioHash,
      basePath,
      enhancementEnabled,
      locale,
      provider,
      text,
    });
  const filename = await outputFilename(formInput.enhanceReferenceAudio);

  const cachedOutputUrl = await redis.get<string>(filename);
  if (cachedOutputUrl) {
    return cloneSuccessResponse(cachedOutputUrl, currentAmount, 0);
  }

  const generate = async ({
    creditsUsed,
    enhancement,
    input,
    outputName,
    reservation,
  }: {
    creditsUsed: number;
    enhancement: AppliedEnhancement | null;
    input: ProcessedCloneInputAudio;
    outputName: string;
    reservation: CreditReservation;
  }): Promise<Response> => {
    let outputUrl: string;
    let modelUsed: string;
    let requestId: string;

    if (provider === 'mistral') {
      const result = await generateVoiceWithMistral(text, {
        referenceAudio: input.buffer,
      });
      outputUrl = await uploadGeneratedAudio(
        result.buffer,
        outputName,
        'audio/wav',
      );
      modelUsed = result.modelUsed;
      requestId = result.requestId;
    } else {
      // Chatterbox needs a fetchable reference URL.
      const referenceAudioFilename = sanitizeFilename(file.name);
      const processedFilename =
        input.mimeType === 'audio/wav' &&
        !referenceAudioFilename.endsWith('.wav')
          ? `${referenceAudioFilename.replace(/\.[^/.]+$/, '')}.wav`
          : referenceAudioFilename;
      const referenceAudioUrl = await uploadFileToR2(
        `clone-voice-input/${user.id}-${input.audioHash}-${processedFilename}`,
        input.buffer,
        input.mimeType,
      );
      const result = await cloneVoiceWithReplicate(
        text,
        locale,
        referenceAudioUrl,
      );
      outputUrl = await uploadGeneratedAudio(
        result.blob,
        outputName,
        'audio/wav',
      );
      modelUsed = result.modelUsed;
      requestId = result.requestId;
    }

    await reservation.settle(creditsUsed, 'clone_voice_success');
    after(async () => {
      await runBackgroundTasks(user.id, creditsUsed, provider, {
        baseCloneCredits: estimate,
        duration: input.duration as number,
        filename: outputName,
        locale,
        modelUsed,
        referenceAudioEnhanced: enhancement !== null,
        referenceAudioEnhancementCredits: enhancement?.credits ?? 0,
        referenceAudioEnhancementDollarAmount: enhancement?.dollarAmount ?? 0,
        referenceAudioEnhancementDurationSeconds:
          enhancement?.durationSeconds ?? null,
        referenceAudioEnhancementModel: enhancement?.model ?? null,
        referenceAudioEnhancementRequestId: enhancement?.requestId ?? null,
        referenceAudioFileMimeType: file.type || '',
        referenceAudioOriginalDurationSeconds: processedAudio.originalDuration,
        referenceAudioProcessedMimeType: input.mimeType,
        referenceAudioTrimmed: processedAudio.wasTrimmed,
        requestId,
        text,
        url: outputUrl,
      });
    });

    return cloneSuccessResponse(outputUrl, currentAmount, creditsUsed);
  };

  if (!formInput.enhanceReferenceAudio) {
    validateAudioDuration(processedAudio.duration, provider);
    return withReservedCredits(
      {
        currentAmount,
        requiredCredits: estimate,
        text,
        userEmail: user.email,
        userId: user.id,
      },
      (reservation) =>
        generate({
          creditsUsed: estimate,
          enhancement: null,
          input: processedAudio,
          outputName: filename,
          reservation,
        }),
    );
  }

  const enhancementDurationSeconds = processedAudio.duration;
  const enhancementCredits = calculateReferenceAudioEnhancementCredits(
    enhancementDurationSeconds,
  );
  validateCreditAmount({
    currentAmount,
    requiredCredits: estimate + enhancementCredits,
    text,
    userEmail: user.email,
    userId: user.id,
  });

  return withReservedCredits(
    {
      currentAmount,
      requiredCredits: estimate + enhancementCredits,
      text,
      userEmail: user.email,
      userId: user.id,
    },
    async (reservation) => {
      const enhanced = await enhanceReference(processedAudio, file, {
        locale,
        signal,
        userId: user.id,
      });
      if (enhanced) {
        validateAudioDuration(enhanced.input.duration, provider);
        return generate({
          creditsUsed: estimate + enhancementCredits,
          enhancement: {
            credits: enhancementCredits,
            dollarAmount: getReferenceAudioEnhancementDollarCost(
              enhancementDurationSeconds,
            ),
            durationSeconds: enhancementDurationSeconds,
            model: enhanced.model,
            requestId: enhanced.requestId,
          },
          input: enhanced.input,
          outputName: filename,
          reservation,
        });
      }

      // Fall back to the original reference at the unenhanced price.
      const fallbackFilename = await outputFilename(false);
      const fallbackCachedOutputUrl = await redis.get<string>(fallbackFilename);
      if (fallbackCachedOutputUrl) {
        await reservation.release('clone_voice_enhancement_fallback_cache_hit');
        return cloneSuccessResponse(fallbackCachedOutputUrl, currentAmount, 0);
      }
      if (reservation.held > estimate) {
        await reservation.release(
          'clone_voice_enhancement_fallback',
          reservation.held - estimate,
        );
      }
      validateAudioDuration(processedAudio.duration, provider);
      return generate({
        creditsUsed: estimate,
        enhancement: null,
        input: processedAudio,
        outputName: fallbackFilename,
        reservation,
      });
    },
  );
}

// ============================================================================
// Main Route Handler
// ============================================================================

export async function POST(request: Request) {
  let text = '';
  let locale = '';

  try {
    const supabase = await createClient();
    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      return routeErrorResponse('User not found', 401, 'errors.userNotFound');
    }
    const user = { email: claims.email, id: claims.sub };

    setUser({
      email: user.email,
      id: user.id,
    });

    validateContentType(request.headers.get('content-type') || '');

    const formInput = await parseFormData(request);
    text = formInput.text;
    locale = formInput.locale;

    validateLocale(locale);

    const { savedVoiceId, saveVoiceName } = formInput;
    if (savedVoiceId) {
      return await speakWithSavedVoice({ ...formInput, savedVoiceId }, user);
    }

    const file = formInput.file;
    if (!file) {
      throw createRouteError(
        'Missing required parameters: text and audio file',
        400,
        'errors.missingRequiredParameters',
      );
    }
    validateFileType(file);
    validateFileSize(file);

    const userHasPaid = await hasUserPaid(user.id);
    if (saveVoiceName) {
      return await saveVoice(
        { ...formInput, saveVoiceName },
        file,
        user,
        userHasPaid,
      );
    }
    return await cloneOnce(formInput, file, user, userHasPaid, request.signal);
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
      errorData: error,
      locale,
      text,
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

    const serverMessage =
      'An unexpected error occurred while cloning voice. Please try again.';

    // biome-ignore lint/plugin: clone-voice intentionally returns a structured error body ({ error, serverMessage, status, code }) that its client and tests depend on; APIErrorResponse doesn't carry the route-specific `code`.
    return NextResponse.json(
      {
        code: 'errors.internalError',
        error: serverMessage,
        serverMessage,
        status: 500,
      } satisfies CloneErrorResponseBody,
      { status: 500 },
    );
  }
}
