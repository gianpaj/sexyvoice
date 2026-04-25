import type { GenerateContentResponse } from '@google/genai';
import { type ClassValue, clsx } from 'clsx';
import { customAlphabet } from 'nanoid';
import { redirect } from 'next/navigation';
import type { Prediction } from 'replicate';
import { twMerge } from 'tailwind-merge';

import type { CloneProvider } from '@/lib/clone/constants';

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

export type TtsProvider = 'gemini' | 'grok' | 'replicate';

const DEFAULT_CREDIT_MULTIPLIER = 4;
const GEMINI_CREDIT_MULTIPLIER = 1.1;
const GROK_CHAR_BUCKET = 100;
const GROK_CREDITS_PER_BUCKET = 100;

export function getTtsProvider(model?: string): TtsProvider {
  if (model === 'gpro') {
    return 'gemini';
  }

  if (model === 'grok') {
    return 'grok';
  }

  return 'replicate';
}

export function countWords(text: string): number {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return 0;
  }

  return trimmedText.split(/\s+/).length;
}

export function calculateReadingTime(
  wordCount: number,
  wordsPerMinute = 200,
): number {
  if (wordCount <= 0) {
    return 0;
  }

  if (!(wordsPerMinute > 0)) {
    throw new RangeError('wordsPerMinute must be greater than 0');
  }

  return Math.ceil(wordCount / wordsPerMinute);
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
      multiplier = DEFAULT_CREDIT_MULTIPLIER;
      break;
  }

  if (model === 'gpro') {
    multiplier = GEMINI_CREDIT_MULTIPLIER;
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

// $4.20 / 1M characters
// ~1 credit per character (~1,000 credits per minute of audio)
export function estimateGrokCredits(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  return Math.ceil(text.length / GROK_CHAR_BUCKET) * GROK_CREDITS_PER_BUCKET;
}

export function estimateCredits(
  text: string,
  voice: string,
  model?: string,
): number {
  const words = countWords(text);

  if (words === 0) {
    return 0;
  }

  if (getTtsProvider(model) === 'grok') {
    return estimateGrokCredits(text);
  }

  return calculateCredits(words, voice, model);
}

// Credit calculation constants for gpro voices
const CREDITS_PER_TOKEN = 1.1;

export function calculateCreditsFromTokens(
  tokenCount: number,
  // voice?: string,
  // model?: string,
): number {
  const normalizedTokens = Math.max(0, tokenCount);

  // Calculate estimated credits based on tokens
  // Using a ratio that approximates the actual credit consumption
  return Math.ceil(normalizedTokens * CREDITS_PER_TOKEN);
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
  FREE_QUOTA_EXCEEDED: 'FREE_QUOTA_EXCEEDED',
  PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
  OTHER_GEMINI_BLOCK: 'OTHER_GEMINI_BLOCK',
  REPLICATE_ERROR: 'REPLICATE_ERROR',
  XAI_TTS_ERROR: 'XAI_TTS_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

/**
 * Maps error codes to appropriate HTTP status codes.
 * - 422: Client input issues (content policy violations)
 * - 500: Server/upstream errors (third-party API failures)
 * - 503: Service temporarily unavailable (quota exceeded)
 */
export const ERROR_STATUS_CODES: Record<keyof typeof ERROR_CODES, number> = {
  PROHIBITED_CONTENT: 422,
  FREE_QUOTA_EXCEEDED: 503,
  OTHER_GEMINI_BLOCK: 500,
  REPLICATE_ERROR: 500,
  XAI_TTS_ERROR: 500,
  THIRD_P_QUOTA_EXCEEDED: 503,
  INTERNAL_SERVER_ERROR: 500,
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
    FREE_QUOTA_EXCEEDED: {
      default:
        'Free users have exceeded the quota. Please try tomorrow or upgrade your account to continue',
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
    XAI_TTS_ERROR: {
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

export function isWavFormat(buffer: Buffer): boolean {
  // WAV files start with "RIFF" and have "WAVE" at byte 8
  return (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  );
}

export const getDollarCost = (
  provider: CloneProvider,
  credits?: number,
  text?: string,
) => {
  if (provider === 'mistral') {
    // $0.016 per 1k characters
    return text ? (text.length / 1000) * 0.016 : -1;
  }
  if (provider === 'replicate') {
    // resemble-ai/chatterbox-multilingual - model costs approximately $0.0046 to run on Replicate
    // 0.012 is the average of 11 last predictions - https://replicate.com/predictions
    return credits ? 0.0121 : -1;
  }
  return -1;
};
