import {
  FinishReason,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';

import { extractInlineAudio } from '@/lib/ai';
import { ERROR_CODES, getErrorMessage } from '@/lib/utils';
import {
  getGoogleApiErrorStatus,
  isGoogleQuotaError,
  isGoogleTransientProviderError,
} from '@/utils/google-rpc-status';
import { parseGoogleApiError } from '@/utils/googleErrors';

/** Fallback model used when the primary Gemini TTS model fails. */
export const GEMINI_FLASH_MODEL = 'gemini-2.5-flash-preview-tts';

/**
 * The Google AI SDK wraps native AbortError into a generic Error whose name
 * stays "Error" but whose message contains "AbortError" or "aborted".
 * This helper covers both the native case and the SDK-wrapped case.
 */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  const msg = error.message.toLowerCase();
  return /\babort(?:ed| ?error)\b/.test(msg);
}

/**
 * Build the Gemini TTS request config. `abortSignal` is optional so callers
 * that do not wire client-abort handling (e.g. the external API) can omit it.
 */
export function buildGeminiTtsConfig({
  voiceName,
  seed,
  abortSignal,
}: {
  voiceName: string;
  seed?: number;
  abortSignal?: AbortSignal;
}): GenerateContentConfig {
  return {
    ...(abortSignal ? { abortSignal } : {}),
    responseModalities: ['AUDIO'],
    ...(seed === undefined ? {} : { seed }),
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: voiceName.charAt(0).toUpperCase() + voiceName.slice(1),
        },
      },
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  };
}

/**
 * Resolve the effective Gemini model id for a request.
 * - paid: gpro31 → gemini-3.1-flash-tts-preview, else gemini-2.5-pro-preview-tts
 * - free: gemini-2.5-flash-preview-tts
 *
 * The external API always generates at the "paid" tier (pass userHasPaid:true)
 * and relies on the flash fallback in `generateGeminiAudio`.
 */
export function selectGeminiModel({
  dbModel,
  userHasPaid,
}: {
  dbModel: string;
  userHasPaid: boolean;
}): string {
  if (!userHasPaid) {
    return GEMINI_FLASH_MODEL;
  }
  return dbModel === 'gpro31'
    ? 'gemini-3.1-flash-tts-preview'
    : 'gemini-2.5-pro-preview-tts';
}

export interface GeminiAudioClassification {
  blockReason?: string;
  data?: string;
  /** null when the response carries valid audio; otherwise the failure code. */
  errorCode:
    | 'PROHIBITED_CONTENT'
    | 'NO_AUDIO_DATA'
    | 'OTHER_GEMINI_BLOCK'
    | null;
  finishReason?: FinishReason;
  isNoAudioData: boolean;
  isProhibitedContent: boolean;
  mimeType?: string;
}

/**
 * Classify a Gemini generateContent response into usable audio or a failure
 * code. Pure — callers own logging and response shaping from the result.
 */
export function classifyGeminiAudio(
  response: GenerateContentResponse | null,
): GeminiAudioClassification {
  const { data, mimeType } = extractInlineAudio(response);
  const finishReason = response?.candidates?.[0]?.finishReason;
  const blockReason = response?.promptFeedback?.blockReason;

  const isProhibitedContent =
    finishReason === FinishReason.PROHIBITED_CONTENT ||
    blockReason === 'PROHIBITED_CONTENT';
  // Finished normally but no audio came back — transient provider glitch
  // rather than a content block, so surface it as retryable.
  const isNoAudioData =
    finishReason === FinishReason.STOP && !(data && mimeType);

  const isSuccess = finishReason === FinishReason.STOP && !!data && !!mimeType;

  let errorCode: GeminiAudioClassification['errorCode'] = null;
  if (!isSuccess) {
    if (isProhibitedContent) {
      errorCode = 'PROHIBITED_CONTENT';
    } else if (isNoAudioData) {
      errorCode = 'NO_AUDIO_DATA';
    } else {
      errorCode = 'OTHER_GEMINI_BLOCK';
    }
  }

  return {
    data,
    mimeType,
    finishReason,
    blockReason,
    isProhibitedContent,
    isNoAudioData,
    errorCode,
  };
}

/** Thrown when both the primary Gemini model and the flash fallback fail. */
export class GeminiGenerationError extends Error {
  readonly proError: unknown;
  readonly flashError: unknown;

  constructor(proError: unknown, flashError: unknown) {
    const proMessage =
      proError instanceof Error ? proError.message : String(proError);
    const flashMessage =
      flashError instanceof Error ? flashError.message : String(flashError);
    super(
      `Both Gemini models failed. Pro error: ${proMessage}. Flash error: ${flashMessage}`,
    );
    this.name = 'GeminiGenerationError';
    this.proError = proError;
    this.flashError = flashError;
  }
}

export interface GeminiGenerationResult {
  modelUsed: string;
  /** Set when the primary model failed and the flash fallback was used. */
  primaryError?: unknown;
  response: GenerateContentResponse;
}

/**
 * Run Gemini TTS generation with a single flash fallback.
 *
 * Calls `primaryModel` first. On failure it retries with the flash model,
 * unless the primary model already *is* flash (then the error propagates) or
 * the failure is an abort (rethrown so the caller can short-circuit). When
 * both models fail it throws {@link GeminiGenerationError} carrying both
 * underlying errors so callers can map provider quota/transient failures.
 */
export async function generateGeminiAudio({
  ai,
  primaryModel,
  text,
  config,
}: {
  ai: GoogleGenAI;
  primaryModel: string;
  text: string;
  config: GenerateContentConfig;
}): Promise<GeminiGenerationResult> {
  const contents = [{ role: 'user', parts: [{ text }] }];
  try {
    const response = await ai.models.generateContent({
      model: primaryModel,
      contents,
      config,
    });
    return { response, modelUsed: primaryModel };
  } catch (primaryError) {
    // Abort is not retryable; let the caller handle client disconnects.
    if (isAbortError(primaryError)) {
      throw primaryError;
    }
    // Primary already was the flash model — nothing left to fall back to.
    if (primaryModel === GEMINI_FLASH_MODEL) {
      throw primaryError;
    }
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents,
        config,
      });
      return { response, modelUsed: GEMINI_FLASH_MODEL, primaryError };
    } catch (flashError) {
      if (isAbortError(flashError)) {
        throw flashError;
      }
      throw new GeminiGenerationError(primaryError, flashError);
    }
  }
}

export interface GeminiProviderFailure {
  code: string;
  googleCode?: number;
  googleStatus?: string;
  message: string;
  status: number;
  type: 'rate_limit_error' | 'server_error';
}

/**
 * Map a Gemini pro/flash failure pair to a structured provider failure
 * (quota exhausted or transient unavailability). Returns null when the
 * failure is not a recognised provider-side condition.
 */
export function getGeminiProviderFailure(
  proError: unknown,
  flashError: unknown,
): GeminiProviderFailure | null {
  const proGoogleError = parseGoogleApiError(proError);
  const flashGoogleError = parseGoogleApiError(flashError);
  const parsedErrors = [proGoogleError, flashGoogleError].filter(
    (error): error is NonNullable<typeof error> => error !== null,
  );

  if (flashGoogleError && isGoogleQuotaError(flashGoogleError)) {
    return {
      code: 'provider_quota_exceeded',
      googleCode: flashGoogleError.code,
      googleStatus: getGoogleApiErrorStatus(flashGoogleError),
      message: getErrorMessage(
        ERROR_CODES.THIRD_P_QUOTA_EXCEEDED,
        'voice-generation',
      ),
      status: 429,
      type: 'rate_limit_error',
    };
  }

  const transientError = parsedErrors.find((error) =>
    isGoogleTransientProviderError(error),
  );

  if (transientError) {
    return {
      code: 'provider_unavailable',
      googleCode: transientError.code,
      googleStatus: getGoogleApiErrorStatus(transientError),
      message: getErrorMessage(
        ERROR_CODES.GEMINI_PROVIDER_UNAVAILABLE,
        'voice-generation',
      ),
      status: 503,
      type: 'server_error',
    };
  }

  return null;
}
