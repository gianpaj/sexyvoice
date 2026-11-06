import {
  type Content,
  type FinishReason,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';

import { extractInlineAudio } from '@/lib/ai';
import { getProviderUnavailableMessage } from '@/lib/errors/provider-unavailable-message';
import {
  buildGeminiVoiceConfig,
  GEMINI_TTS_38,
  GEMINI_TTS_FLASH_FREE,
} from '@/lib/tts/gemini-prompt';
import {
  classifyGeminiTtsResponse,
  geminiOutcomeToErrorCode,
} from '@/lib/tts/gemini-response';
import { ERROR_CODES, getErrorMessage } from '@/lib/utils';
import { parseGoogleApiError } from '@/utils/google-errors';
import {
  getGoogleApiErrorStatus,
  isGoogleQuotaError,
  isGoogleTransientProviderError,
} from '@/utils/google-rpc-status';

/** Fallback model used when the primary Gemini TTS model fails. */
export const GEMINI_FLASH_MODEL = GEMINI_TTS_FLASH_FREE;

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
 * without a request lifecycle can omit it.
 */
export function buildGeminiTtsConfig({
  voiceName,
  model,
  seed,
  temperature,
  abortSignal,
}: {
  voiceName: string;
  model?: string;
  seed?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}): GenerateContentConfig {
  return {
    ...(abortSignal ? { abortSignal } : {}),
    responseModalities: ['AUDIO'],
    ...(seed === undefined ? {} : { seed }),
    ...(temperature === undefined ? {} : { temperature }),
    speechConfig: {
      voiceConfig: buildGeminiVoiceConfig(voiceName, model),
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  };
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

  const outcome = classifyGeminiTtsResponse({
    blockReason,
    finishReason,
    hasAudio: Boolean(data && mimeType),
  });
  const isProhibitedContent = outcome === 'content_blocked';
  const isNoAudioData = outcome === 'no_audio';
  const errorCode = geminiOutcomeToErrorCode(outcome) ?? null;

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

  constructor(proError: unknown, options: ErrorOptions & { cause: unknown }) {
    const flashError = options.cause;
    const proMessage =
      proError instanceof Error ? proError.message : String(proError);
    const flashMessage =
      flashError instanceof Error ? flashError.message : String(flashError);
    super(
      `Both Gemini models failed. Pro error: ${proMessage}. Flash error: ${flashMessage}`,
      options,
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
 * unless the primary is Flash or 3.8, whose extended voices require 3.8, or
 * the failure is an abort (rethrown so the caller can short-circuit). When
 * both models fail it throws {@link GeminiGenerationError} carrying both
 * underlying errors so callers can map provider quota/transient failures.
 */
export async function generateGeminiAudio({
  ai,
  primaryModel,
  contents,
  config,
}: {
  ai: GoogleGenAI;
  primaryModel: string;
  contents: Content[];
  config: GenerateContentConfig;
}): Promise<GeminiGenerationResult> {
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
    // Flash has no fallback; 3.8 extended voices require their selected model.
    if (primaryModel === GEMINI_FLASH_MODEL || primaryModel === GEMINI_TTS_38) {
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
      throw new GeminiGenerationError(primaryError, {
        cause: flashError,
      });
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
 * Classify Gemini attempt errors, including a single 3.8 attempt. Quota is
 * judged on the final attempt; transient failures can come from any attempt.
 */
export function getGeminiProviderFailure(
  attemptErrors: unknown[],
): GeminiProviderFailure | null {
  const parsedErrors = attemptErrors
    .map((error) => parseGoogleApiError(error))
    .filter((error): error is NonNullable<typeof error> => error !== null);
  const finalGoogleError = parseGoogleApiError(attemptErrors.at(-1));

  if (finalGoogleError && isGoogleQuotaError(finalGoogleError)) {
    return {
      code: 'provider_quota_exceeded',
      googleCode: finalGoogleError.code,
      googleStatus: getGoogleApiErrorStatus(finalGoogleError),
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
      message: getProviderUnavailableMessage('gemini'),
      status: 503,
      type: 'server_error',
    };
  }

  return null;
}
