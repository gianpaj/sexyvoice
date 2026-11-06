import type { GenerateContentResponse } from '@google/genai';
import { type ClassValue, clsx } from 'clsx';
import { customAlphabet } from 'nanoid';
import { redirect } from 'next/navigation';
import type { Prediction } from 'replicate';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7,
); // 7-character random string

export function formatDate(
  input: string | number | Date,
  { withTime = false }: { withTime?: boolean } = {},
): string {
  const date = new Date(input);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime && {
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
}

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: 'error' | 'success',
  path: string,
  message: string,
): never {
  return redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}

interface GeminiMetadata extends Record<string, string> {
  readonly candidatesTokenCount: string;
  readonly promptTokenCount: string;
  readonly totalTokenCount: string;
}

interface ReplicateMetadata extends Record<string, string> {
  readonly predict_time: string;
  readonly total_time: string;
}

export function extractMetadata(
  isGeminiVoice: boolean,
  genAIResponse: GenerateContentResponse | null,
  replicateResponse?: Prediction,
): GeminiMetadata | ReplicateMetadata | undefined {
  if (isGeminiVoice) {
    const metadata = genAIResponse?.usageMetadata;
    if (
      !(
        metadata?.promptTokenCount &&
        metadata.candidatesTokenCount &&
        metadata.totalTokenCount
      )
    ) {
      return;
    }
    return {
      candidatesTokenCount: metadata.candidatesTokenCount.toString(),
      promptTokenCount: metadata.promptTokenCount.toString(),
      totalTokenCount: metadata.totalTokenCount.toString(),
    } as const;
  }
  const metrics = replicateResponse?.metrics;
  if (!(metrics?.predict_time && metrics?.total_time)) {
    return;
  }
  return {
    predict_time: metrics.predict_time.toString(),
    total_time: metrics.total_time.toString(),
  } as const;
}

export const ERROR_CODES = {
  FREE_QUOTA_EXCEEDED: 'FREE_QUOTA_EXCEEDED',
  GEMINI_INPUT_TOO_LONG: 'GEMINI_INPUT_TOO_LONG',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  NO_AUDIO_DATA: 'NO_AUDIO_DATA',
  OTHER_GEMINI_BLOCK: 'OTHER_GEMINI_BLOCK',
  PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  REPLICATE_ERROR: 'REPLICATE_ERROR',
  THIRD_P_QUOTA_EXCEEDED: 'THIRD_P_QUOTA_EXCEEDED',
  XAI_TTS_ERROR: 'XAI_TTS_ERROR',
} as const;

/**
 * Maps error codes to appropriate HTTP status codes.
 * - 422: Client input issues (content policy violations)
 * - 500: Server/upstream errors (third-party API failures)
 * - 503: Service temporarily unavailable (quota exceeded / transient upstream)
 */
const ERROR_STATUS_CODES: Record<keyof typeof ERROR_CODES, number> = {
  FREE_QUOTA_EXCEEDED: 503,
  GEMINI_INPUT_TOO_LONG: 400,
  INTERNAL_SERVER_ERROR: 500,
  NO_AUDIO_DATA: 503,
  OTHER_GEMINI_BLOCK: 500,
  PROHIBITED_CONTENT: 422,
  PROVIDER_UNAVAILABLE: 503,
  REPLICATE_ERROR: 500,
  THIRD_P_QUOTA_EXCEEDED: 503,
  XAI_TTS_ERROR: 500,
};

export const getErrorStatusCode = (
  errorCode: keyof typeof ERROR_CODES | unknown,
): number => {
  if (typeof errorCode === 'string' && errorCode in ERROR_STATUS_CODES) {
    return ERROR_STATUS_CODES[errorCode as keyof typeof ERROR_CODES];
  }
  return 500;
};

export const getErrorMessage = (
  errorCode: keyof typeof ERROR_CODES | unknown,
  service: string,
) => {
  // PROVIDER_UNAVAILABLE is intentionally absent because its message requires
  // provider interpolation. Server routes use getProviderUnavailableMessage().
  const errorMessages: Partial<
    Record<keyof typeof ERROR_CODES, { [key: string]: string }>
  > = {
    FREE_QUOTA_EXCEEDED: {
      default:
        'Free users have exceeded the quota. Please try tomorrow or upgrade your account to continue',
    },
    GEMINI_INPUT_TOO_LONG: {
      default:
        'Your text is too long for this voice. Please shorten it or use Split mode.',
    },
    INTERNAL_SERVER_ERROR: {
      default: 'An internal server error occurred. Please try again later.',
    },
    NO_AUDIO_DATA: {
      default: 'Voice generation returned no audio, please retry',
    },
    OTHER_GEMINI_BLOCK: {
      default: 'Voice generation failed, please retry',
    },
    // UNAUTHORIZED: {
    //   default: 'You are not authorized to perform this action.',
    //   'voice-generation': 'You are not authorized to generate voice content.',
    // },
    // NOT_FOUND: {
    //   default: 'The requested resource was not found.',
    //   'voice-generation': 'The requested voice resource was not found.',
    // },
    PROHIBITED_CONTENT: {
      default:
        'Content generation prohibited. Please modify your text input and try again',
    },
    REPLICATE_ERROR: {
      default: 'Voice generation failed, please retry',
    },
    // INVALID_API_KEY: {
    //   default: 'The provided API key is invalid.',
    //   'voice-generation': 'The voice generation API key is invalid.',
    // },
    THIRD_P_QUOTA_EXCEEDED: {
      default:
        'We have exceeded our third-party API current quota, please try later or tomorrow',
    },
    XAI_TTS_ERROR: {
      default: 'Voice generation failed, please retry',
    },
  };

  const serviceMessages = errorMessages[errorCode as keyof typeof ERROR_CODES];
  if (!serviceMessages) {
    return 'An unknown error occurred.';
  }

  return serviceMessages[service] || serviceMessages.default;
};
