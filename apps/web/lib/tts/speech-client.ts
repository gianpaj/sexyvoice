import type { QueryClient } from '@tanstack/react-query';

import type { GenerationSettings } from '@/hooks/use-generation-settings';
import { invalidateCredits } from '@/lib/credits-query';
import { APIError } from '@/lib/error-ts';
import {
  type ErrorCodesTranslator,
  resolveErrorMessage,
} from '@/lib/errors/resolve-error-message';
import type { ProviderUnavailableDetails } from '@/lib/provider-errors';
import { validateGenerationInput } from './generation-input';
import type { TtsModel } from './models';

/**
 * Contract of the dashboard speech routes, `POST /api/generate-voice` and
 * `POST /api/estimate-credits`, and the client the generate page calls them
 * with. The routes type their bodies with it.
 */

export interface GenerateSpeechRequestBody {
  language?: string;
  seed?: number;
  speed?: number;
  split: boolean;
  styleVariant: string;
  temperature?: number;
  text: string;
  textImproved: boolean;
  voiceId: string;
}

export interface GenerateSpeechResponseBody {
  cached?: true;
  creditsUsed: number;
  url: string;
}

export interface EstimateSpeechRequestBody {
  styleVariant: string;
  text: string;
  voiceId: string;
}

export interface EstimateSpeechResponseBody {
  estimatedCredits: number;
  tokens?: number;
}

/** The only code the speech routes send; other failures carry a message. */
export type SpeechRouteErrorCode = 'PROVIDER_UNAVAILABLE';

export interface SpeechErrorResponseBody {
  details?: ProviderUnavailableDetails;
  error: string;
  errorCode?: SpeechRouteErrorCode;
  serverMessage: string;
  status: number;
}

/** What a dashboard speech request uses besides its text. */
export interface SpeechParams {
  isPaidUser: boolean;
  /** Grok language picker value. */
  language: string;
  model: TtsModel;
  settings: GenerationSettings;
  style: string | undefined;
  /** Recorded with the generation; it does not change the audio. */
  textImproved: boolean;
  voiceId: string;
}

/**
 * The request fields that shape the audio besides the text. Settings the
 * model ignores or the plan excludes are left out; a retry's fresh seed
 * replaces the pinned one.
 */
export function speechRequestFields(params: SpeechParams, seed?: number) {
  const input = validateGenerationInput(params.model, {
    isPaidUser: params.isPaidUser,
    settings: {
      ...params.settings,
      language: params.language,
      seed: seed ?? params.settings.seed,
    },
    style: params.style,
  });
  return {
    ...input.settings,
    styleVariant: input.style ?? '',
    voiceId: params.voiceId,
  };
}

interface SpeechClientOptions {
  /** Message for a failure the route did not describe. */
  fallback: string;
  translateErrorCode: ErrorCodesTranslator;
}

async function postSpeechRoute<T>(
  url: string,
  body: GenerateSpeechRequestBody | EstimateSpeechRequestBody,
  { fallback, translateErrorCode }: SpeechClientOptions,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    const failure = data as Partial<SpeechErrorResponseBody>;
    throw new APIError(
      resolveErrorMessage(
        translateErrorCode,
        failure.errorCode,
        failure.details,
        failure.error || failure.serverMessage || fallback,
      ),
      response,
    );
  }
  return data as T;
}

/**
 * Generates speech. Credits refresh afterwards unless the audio came from the
 * cache or the request was cancelled.
 */
export async function generateSpeech(
  params: SpeechParams,
  request: { seed?: number; split: boolean; text: string },
  {
    queryClient,
    signal,
    ...options
  }: SpeechClientOptions & { queryClient: QueryClient; signal: AbortSignal },
): Promise<GenerateSpeechResponseBody> {
  let cached = false;
  try {
    const result = await postSpeechRoute<GenerateSpeechResponseBody>(
      '/api/generate-voice',
      {
        ...speechRequestFields(params, request.seed),
        split: request.split,
        text: request.text,
        textImproved: params.textImproved,
      },
      options,
      signal,
    );
    cached = result.cached === true;
    return result;
  } finally {
    // An aborted fetch cannot confirm settlement. Refreshing can race a refund;
    // skipping it can miss a late charge. See ARCHITECTURE.md#credit-balance-sync.
    if (!(cached || signal.aborted)) {
      invalidateCredits(queryClient).catch(() => undefined);
    }
  }
}

export async function estimateSpeech(
  params: SpeechParams,
  text: string,
  options: SpeechClientOptions,
): Promise<number> {
  const { styleVariant, voiceId } = speechRequestFields(params);
  const { estimatedCredits } =
    await postSpeechRoute<EstimateSpeechResponseBody>(
      '/api/estimate-credits',
      { styleVariant, text, voiceId },
      options,
    );
  if (!Number.isFinite(estimatedCredits)) {
    throw new Error('The credit estimate is not a number');
  }
  return estimatedCredits;
}

/** Toast copy for a failed request: the route's message, else the fallback. */
export function speechErrorMessage(error: unknown, fallback: string): string {
  return error instanceof APIError ? error.message : fallback;
}
