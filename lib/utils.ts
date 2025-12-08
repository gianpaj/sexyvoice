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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(withTime && {
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
}

function getCreditMultiplier(voice: string, model?: string): number {
  let multiplier: number;
  switch (voice) {
    case 'pietro':
    case 'giulia':
    case 'carlo':
    case 'javi':
    case 'sergio':
    case 'maria':
      multiplier = 8;
      break;
    case 'clone':
      multiplier = 11;
      break;
    default:
      multiplier = 4;
      break;
  }

  if (model === 'gpro') {
    multiplier = 4;
  }

  return multiplier;
}

function calculateCredits(
  words: number,
  voice: string,
  model?: string,
): number {
  if (!voice) {
    throw new Error('Voice is required');
  }

  if (words <= 0) {
    return 0;
  }

  // Using average speaking rate of 100 words per minute (middle of 120-150 range)
  const wordsPerSecond = 100 / 60; // 2.25 words per second
  const multiplier = getCreditMultiplier(voice, model);

  return Math.ceil((words / wordsPerSecond) * 10 * multiplier);
}

export function estimateCredits(
  text: string,
  voice: string,
  model?: string,
): number {
  // Remove extra whitespace and split into words
  // biome-ignore lint/performance/useTopLevelRegex: ok
  const words = text.trim().split(/\s+/).length;

  if (!text.trim()) {
    return 0;
  }

  return calculateCredits(words, voice, model);
}

export function estimateCreditsFromTokens(
  tokenCount: number,
  voice: string,
  model?: string,
): number {
  const normalizedTokens = Math.max(0, tokenCount);
  return calculateCredits(normalizedTokens, voice, model);
}

export function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
  readonly promptTokenCount: string;
  readonly candidatesTokenCount: string;
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
      promptTokenCount: metadata.promptTokenCount.toString(),
      candidatesTokenCount: metadata.candidatesTokenCount.toString(),
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
  THIRD_P_QUOTA_EXCEEDED: 'THIRD_P_QUOTA_EXCEEDED',
  PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
  OTHER_GEMINI_BLOCK: 'OTHER_GEMINI_BLOCK',
  REPLICATE_ERROR: 'REPLICATE_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export const getErrorMessage = (
  errorCode: keyof typeof ERROR_CODES | unknown,
  service: string,
) => {
  const errorMessages: Record<
    keyof typeof ERROR_CODES,
    { [key: string]: string }
  > = {
    // INVALID_API_KEY: {
    //   default: 'The provided API key is invalid.',
    //   'voice-generation': 'The voice generation API key is invalid.',
    // },
    THIRD_P_QUOTA_EXCEEDED: {
      default:
        'We have exceeded our third-party API current quota, please try later or tomorrow',
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
    OTHER_GEMINI_BLOCK: {
      default: 'Voice generation failed, please retry',
    },
    REPLICATE_ERROR: {
      default: 'Voice generation failed, please retry',
    },
    INTERNAL_SERVER_ERROR: {
      default: 'An internal server error occurred. Please try again later.',
    },
  };

  const serviceMessages = errorMessages[errorCode as keyof typeof ERROR_CODES];
  if (!serviceMessages) {
    return 'An unknown error occurred.';
  }

  return serviceMessages[service] || serviceMessages.default;
};
