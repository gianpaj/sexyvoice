import {
  type GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';
import { captureException, logger } from '@sentry/nextjs';
import Replicate, { type Prediction } from 'replicate';

import { convertToWav } from '@/lib/audio';
import { getProviderUnavailableMessage } from '@/lib/errors/provider-unavailable-message';
import {
  getProviderErrorMessage,
  getProviderErrorName,
  isTransientProviderFailure,
} from '@/lib/provider-errors';
import {
  buildGeminiTtsContents,
  buildGeminiVoiceConfig,
  resolveGeminiTtsModel,
} from './gemini-prompt';
import {
  classifyGeminiTtsResponse,
  extractInlineAudio,
} from './gemini-response';
import {
  getGoogleApiErrorStatus,
  isGoogleQuotaError,
  isGoogleTransientProviderError,
  parseGoogleApiError,
} from './google-errors';
import type { TtsModel, TtsProvider } from './models';
import { generateXaiTts, type XaiTtsCodec } from './xai';

/** Why a provider produced no audio. Each surface maps a kind to its response. */
type SpeechErrorKind =
  | 'aborted'
  | 'content_blocked'
  | 'input_too_long'
  | 'invalid_argument'
  | 'no_audio'
  | 'output_limit'
  | 'provider_error'
  | 'provider_unavailable'
  | 'quota_exceeded'
  | 'unexpected_response';

export const SPEECH_ERROR_MESSAGES: Record<
  Exclude<SpeechErrorKind, 'provider_unavailable'>,
  string
> = {
  aborted: 'Request aborted',
  content_blocked:
    'Content generation prohibited. Please modify your text input and try again',
  input_too_long:
    'Your text is too long for this voice. Please shorten it or use Split mode.',
  invalid_argument: 'Voice generation failed, please retry',
  no_audio: 'Voice generation returned no audio, please retry',
  output_limit:
    'The voice reached its audio output limit. Shorten the text and try again.',
  provider_error: 'Voice generation failed, please retry',
  quota_exceeded:
    'We have exceeded our third-party API current quota, please try later or tomorrow',
  unexpected_response: 'Voice generation failed, please retry',
};

export class SpeechError extends Error {
  readonly kind: SpeechErrorKind;
  readonly provider: TtsProvider;
  /** Google's RPC status and HTTP code when Google rejected the request. */
  readonly google?: { code?: number; status?: string };

  constructor(
    kind: SpeechErrorKind,
    {
      cause,
      google,
      provider,
    }: {
      cause?: unknown;
      google?: SpeechError['google'];
      provider: TtsProvider;
    },
  ) {
    super(
      kind === 'provider_unavailable'
        ? getProviderUnavailableMessage(provider)
        : SPEECH_ERROR_MESSAGES[kind],
      { cause },
    );
    this.name = 'SpeechError';
    this.kind = kind;
    this.provider = provider;
    this.google = google;
  }
}

/**
 * Undici reports a provider that sent no response headers in time as a
 * TypeError caused by UND_ERR_HEADERS_TIMEOUT.
 */
function isTransientGrokFailure(error: unknown): boolean {
  const cause: unknown = error instanceof TypeError ? error.cause : undefined;
  return (
    (Error.isError(cause) &&
      'code' in cause &&
      cause.code === 'UND_ERR_HEADERS_TIMEOUT') ||
    isTransientProviderFailure(error)
  );
}

/**
 * The Google AI SDK wraps a native AbortError into a generic Error whose name
 * stays "Error" but whose message contains "AbortError" or "aborted".
 */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  return /\babort(?:ed| ?error)\b/.test(error.message.toLowerCase());
}

interface SpeechRequest {
  codec?: XaiTtsCodec;
  /** Stored `voices.model`; the Replicate model path for Orpheus. */
  dbModel: string;
  language: string;
  model: TtsModel;
  /** Gemini sampling settings. */
  seed?: number;
  signal?: AbortSignal;
  /** Grok speech settings. */
  speed?: number;
  /** Gemini delivery style. */
  style?: string;
  temperature?: number;
  text: string;
  voiceName: string;
}

interface SynthesizedSpeech {
  audio: Buffer;
  /** Grok output codec. */
  codec?: XaiTtsCodec;
  mimeType: string;
  predictionId?: string;
  /** Provider model that produced the audio. */
  runtimeModel: string;
  /** Gemini total tokens, which set the final charge. */
  totalTokens?: number;
  /** Gemini token counts or Replicate timings, stored with the generation. */
  usage?: Record<string, string>;
}

interface SynthesisContext {
  extra?: Record<string, unknown>;
  /**
   * Adds the text and style to provider logs. The dashboard sets it for
   * support investigations; external API text never reaches the logs.
   */
  logText?: boolean;
  /** Sentry user and extra fields for provider logs. */
  user: { email?: string; id: string };
}

/**
 * Turn text into speech with the model's provider. Throws a `SpeechError`
 * when the provider produces no audio; unexpected provider failures reach
 * Sentry here, once.
 */
export function synthesizeSpeech(
  request: SpeechRequest,
  context: SynthesisContext,
): Promise<SynthesizedSpeech> {
  switch (request.model.provider) {
    case 'gemini':
      return synthesizeWithGemini(request, context);
    case 'grok':
      return synthesizeWithGrok(request, context);
    default:
      return synthesizeWithReplicate(request, context);
  }
}

/**
 * Gemini rejects inputs over its 8192-token TTS input limit with an
 * INVALID_ARGUMENT error whose message mentions the token count.
 */
function isGeminiInputTooLong(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes('input token count') ||
    message.includes('maximum number of tokens')
  );
}

function classifyGeminiRequestError(
  error: unknown,
  request: SpeechRequest,
  { extra, user }: SynthesisContext,
): SpeechError {
  if (isAbortError(error)) {
    return new SpeechError('aborted', { cause: error, provider: 'gemini' });
  }

  const googleError = parseGoogleApiError(error);
  if (googleError) {
    const google = {
      code: googleError.code,
      status: getGoogleApiErrorStatus(googleError),
    };
    const details = {
      extra: {
        ...extra,
        googleCode: google.code,
        googleStatus: google.status,
        textLength: request.text.length,
        voice: request.voiceName,
      },
      user,
    };

    if (isGoogleQuotaError(googleError)) {
      logger.warn('Gemini quota exhausted', details);
      return new SpeechError('quota_exceeded', {
        cause: error,
        google,
        provider: 'gemini',
      });
    }
    if (isGoogleTransientProviderError(googleError)) {
      logger.warn('Gemini provider temporarily unavailable', details);
      return new SpeechError('provider_unavailable', {
        cause: error,
        google,
        provider: 'gemini',
      });
    }
    if (google.status === 'INVALID_ARGUMENT') {
      // The reason is the only record of a rejection the user cannot see.
      logger.warn('Gemini rejected TTS request', {
        ...details,
        extra: {
          ...details.extra,
          errorMessage: getProviderErrorMessage(error),
        },
      });
      return new SpeechError(
        isGeminiInputTooLong(error) ? 'input_too_long' : 'invalid_argument',
        { cause: error, google, provider: 'gemini' },
      );
    }
  }

  captureException(error, {
    extra: {
      ...extra,
      model: request.dbModel,
      textLength: request.text.length,
      voice: request.voiceName,
    },
    user,
  });
  return new SpeechError('provider_error', {
    cause: error,
    provider: 'gemini',
  });
}

function geminiUsage(
  response: GenerateContentResponse,
): Pick<SynthesizedSpeech, 'totalTokens' | 'usage'> {
  const metadata = response.usageMetadata;
  if (
    !(
      metadata?.promptTokenCount &&
      metadata.candidatesTokenCount &&
      metadata.totalTokenCount
    )
  ) {
    return {};
  }
  return {
    totalTokens: metadata.totalTokenCount,
    usage: {
      candidatesTokenCount: metadata.candidatesTokenCount.toString(),
      promptTokenCount: metadata.promptTokenCount.toString(),
      totalTokenCount: metadata.totalTokenCount.toString(),
    },
  };
}

async function synthesizeWithGemini(
  request: SpeechRequest,
  context: SynthesisContext,
): Promise<SynthesizedSpeech> {
  const runtimeModel = resolveGeminiTtsModel({ model: request.dbModel });
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

  let response: GenerateContentResponse;
  try {
    response = await ai.models.generateContent({
      config: {
        ...(request.signal ? { abortSignal: request.signal } : {}),
        responseModalities: ['AUDIO'],
        ...(request.seed === undefined ? {} : { seed: request.seed }),
        ...(request.temperature === undefined
          ? {}
          : { temperature: request.temperature }),
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
        speechConfig: {
          voiceConfig: buildGeminiVoiceConfig(
            request.voiceName,
            request.dbModel,
          ),
        },
      },
      contents: buildGeminiTtsContents({
        model: request.dbModel,
        styleVariant: request.style,
        text: request.text,
      }),
      model: runtimeModel,
    });
  } catch (error) {
    throw classifyGeminiRequestError(error, request, context);
  }

  const { data, mimeType } = extractInlineAudio(response);
  const finishReason = response?.candidates?.[0]?.finishReason;
  const blockReason = response?.promptFeedback?.blockReason;
  const outcome = classifyGeminiTtsResponse({
    blockReason,
    finishReason,
    hasAudio: Boolean(data && mimeType),
  });
  const textPreview = (length: number) =>
    context.logText ? { textPreview: request.text.slice(0, length) } : {};
  const details = {
    ...context.extra,
    blockReason,
    finishReason,
    model: runtimeModel,
    provider: 'gemini',
    responseId: response?.responseId,
    ...(context.logText && { styleVariant: request.style }),
    textLength: request.text.length,
    voice: request.voiceName,
  };

  if (outcome === 'content_blocked') {
    logger.warn('Content generation prohibited by Gemini', {
      extra: details,
      user: context.user,
    });
    throw new SpeechError('content_blocked', { provider: 'gemini' });
  }

  if (outcome === 'no_audio') {
    logger.warn('Gemini voice generation returned no audio data', {
      extra: { ...details, ...textPreview(500) },
      user: context.user,
    });
    throw new SpeechError('no_audio', { provider: 'gemini' });
  }

  // MAX_TOKENS can arrive with audio, but the audio may stop mid-sentence.
  if (outcome === 'output_limit') {
    logger.warn('Gemini voice generation reached the output limit', {
      extra: details,
      user: context.user,
    });
    throw new SpeechError('output_limit', { provider: 'gemini' });
  }

  if (outcome !== 'success' || !data || !mimeType) {
    logger.error('Gemini voice generation failed', {
      extra: {
        ...details,
        hasData: Boolean(data),
        mimeType,
        response,
        ...textPreview(500),
      },
      user: context.user,
    });
    // Capture only response shapes that the classifier does not recognize.
    captureException(new Error('Gemini 200 — no audio data'), {
      extra: {
        ...context.extra,
        blockReason,
        finishReason,
        hasData: Boolean(data),
        mimeType,
        model: runtimeModel,
        ...textPreview(200),
        voice: request.voiceName,
      },
      user: { id: context.user.id },
    });
    throw new SpeechError('unexpected_response', { provider: 'gemini' });
  }

  logger.info('Gemini voice generation succeeded', {
    extra: { ...details, ...textPreview(500) },
    user: context.user,
  });

  return {
    audio: convertToWav(data, mimeType),
    mimeType: 'audio/wav',
    runtimeModel,
    ...geminiUsage(response),
  };
}

async function synthesizeWithGrok(
  request: SpeechRequest,
  { extra, user }: SynthesisContext,
): Promise<SynthesizedSpeech> {
  const details = {
    ...extra,
    codec: request.codec,
    language: request.language,
    model: request.dbModel,
    voice: request.voiceName,
  };

  try {
    const result = await generateXaiTts({
      codec: request.codec,
      language: request.language,
      signal: request.signal,
      speed: request.speed,
      text: request.text,
      voiceId: request.voiceName,
    });
    return {
      audio: result.audioBuffer,
      codec: result.codec,
      mimeType: result.contentType,
      runtimeModel: request.dbModel,
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new SpeechError('aborted', { cause: error, provider: 'grok' });
    }
    if (isTransientGrokFailure(error)) {
      logger.warn('Grok TTS provider unavailable', {
        extra: {
          ...details,
          errorMessage: getProviderErrorMessage(error),
          errorName: getProviderErrorName(error),
        },
        user,
      });
      throw new SpeechError('provider_unavailable', {
        cause: error,
        provider: 'grok',
      });
    }

    logger.error('Grok TTS generation failed', {
      extra: {
        ...details,
        errorCause: Error.isError(error) ? error.cause : undefined,
        errorMessage: getProviderErrorMessage(error),
      },
      user,
    });
    captureException(error, {
      extra: { ...details, textLength: request.text.length },
      user,
    });
    throw new SpeechError('provider_error', { cause: error, provider: 'grok' });
  }
}

function replicateUsage(
  prediction: Prediction | undefined,
): Record<string, string> | undefined {
  const metrics = prediction?.metrics;
  if (!(metrics?.predict_time && metrics?.total_time)) {
    return;
  }
  return {
    predict_time: metrics.predict_time.toString(),
    total_time: metrics.total_time.toString(),
  };
}

async function synthesizeWithReplicate(
  request: SpeechRequest,
  { extra, user }: SynthesisContext,
): Promise<SynthesizedSpeech> {
  // Uses REPLICATE_API_TOKEN.
  const replicate = new Replicate();
  let prediction: Prediction | undefined;
  let output: ReadableStream;

  try {
    output = (await replicate.run(
      request.dbModel as `${string}/${string}`,
      {
        input: { text: request.text, voice: request.voiceName },
        ...(request.signal ? { signal: request.signal } : {}),
      },
      (progress: Prediction) => {
        prediction = progress;
      },
    )) as ReadableStream;
  } catch (error) {
    if (isAbortError(error)) {
      throw new SpeechError('aborted', { cause: error, provider: 'replicate' });
    }
    const details = {
      ...extra,
      model: request.dbModel,
      voice: request.voiceName,
    };
    if (isTransientProviderFailure(error)) {
      logger.warn('Replicate voice generation provider unavailable', {
        extra: {
          ...details,
          errorMessage: getProviderErrorMessage(error),
          errorName: getProviderErrorName(error),
        },
        user,
      });
      throw new SpeechError('provider_unavailable', {
        cause: error,
        provider: 'replicate',
      });
    }

    captureException(error, {
      extra: { ...details, textLength: request.text.length },
      user,
    });
    throw new SpeechError('provider_error', {
      cause: error,
      provider: 'replicate',
    });
  }

  return {
    audio: Buffer.from(await new Response(output).arrayBuffer()),
    mimeType: 'audio/mpeg',
    predictionId: prediction?.id,
    runtimeModel: request.dbModel,
    usage: replicateUsage(prediction),
  };
}
