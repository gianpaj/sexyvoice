import { type GenerateContentResponse, GoogleGenAI } from '@google/genai';
// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import {
  extractInlineAudio,
  getCharactersLimit,
  getGeminiStyleCharacterLimit,
} from '@/lib/ai';
import { calculateGenerateApiDollarAmount } from '@/lib/api/pricing';
import { convertToWav, generateHash, resolveDurationString } from '@/lib/audio';
import { APIErrorResponse } from '@/lib/error-ts';
import { getProviderUnavailableMessage } from '@/lib/errors/provider-unavailable-message';
import PostHogClient from '@/lib/posthog';
import {
  getProviderErrorMessage,
  getProviderErrorName,
  getProviderUnavailableDetails,
  isProviderId,
  isTransientProviderFailure,
  type ProviderId,
} from '@/lib/provider-errors';
import { CANCELLED_CHARGE_FLOW } from '@/lib/sentry/server-filters';
import { uploadFileToR2 } from '@/lib/storage/upload';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import {
  getCredits,
  getVoiceById,
  hasUserPaid,
  insertUsageEvent,
  isInsufficientCreditsError,
  reduceCredits,
  reduceCreditsUpTo,
  restoreCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import {
  buildGeminiTtsContents,
  resolveGeminiTtsModel,
} from '@/lib/tts/gemini-prompt';
import {
  classifyGeminiTtsResponse,
  geminiOutcomeToErrorCode,
} from '@/lib/tts/gemini-response';
import { isActiveTtsModel } from '@/lib/tts/models';
import { generateXaiTts, normalizeXaiTtsSpeed } from '@/lib/tts/xai';
import {
  calculateCreditsFromTokens,
  ERROR_CODES,
  estimateCredits,
  extractMetadata,
  getErrorMessage,
  getErrorStatusCode,
  getTtsProvider,
} from '@/lib/utils';
import { parseGoogleApiError } from '@/utils/google-errors';
import {
  getGoogleApiErrorStatus,
  isGoogleQuotaError,
  isGoogleTransientProviderError,
} from '@/utils/google-rpc-status';
import { buildGeminiTtsConfig } from './gemini-tts';

const { logger, captureException } = Sentry;

interface GenerationIdentity {
  email?: string;
  id: string;
}

/**
 * The Google AI SDK wraps native AbortError into a generic Error whose name
 * stays "Error" but whose message contains "AbortError" or "aborted".
 * This helper covers both the native case and the SDK-wrapped case.
 */
function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  const msg = error.message.toLowerCase();
  return /\babort(?:ed| ?error)\b/.test(msg);
}

function providerUnavailableResponse(provider: ProviderId): Response {
  return APIErrorResponse(
    getProviderUnavailableMessage(provider),
    getErrorStatusCode(ERROR_CODES.PROVIDER_UNAVAILABLE),
    {
      details: getProviderUnavailableDetails(provider),
      errorCode: ERROR_CODES.PROVIDER_UNAVAILABLE,
    },
  );
}

function createProviderUnavailableError(
  provider: ProviderId,
  cause: unknown,
): Error {
  return Object.assign(
    new Error(getProviderUnavailableMessage(provider), { cause }),
    {
      provider,
      voiceGenerationErrorCode: ERROR_CODES.PROVIDER_UNAVAILABLE,
    },
  );
}

/**
 * Gemini rejects inputs over its 8192-token TTS input limit with an
 * INVALID_ARGUMENT error whose message mentions the token count. Detect it so
 * we can surface a clean message instead of the raw provider JSON.
 */
function isGeminiInputTooLongError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  if (
    !(
      message.includes('input token count') ||
      message.includes('maximum number of tokens')
    )
  ) {
    return false;
  }
  const googleApiError = parseGoogleApiError(error);
  const status = googleApiError
    ? getGoogleApiErrorStatus(googleApiError)
    : undefined;
  return status === undefined || status === 'INVALID_ARGUMENT';
}

async function refundReservedCredits({
  amount,
  context,
  userId,
}: {
  amount: number;
  context: string;
  userId: string;
}) {
  if (amount <= 0) {
    return;
  }

  try {
    await restoreCredits({ amount, userId });
  } catch (refundError) {
    logger.error('Failed to restore reserved credits', {
      extra: {
        amount,
        context,
        errorMessage:
          refundError instanceof Error
            ? refundError.message
            : String(refundError),
      },
      user: { id: userId },
    });
    captureException(refundError, {
      extra: { amount, context },
      user: { id: userId },
    });
  }
}

async function reconcileReservedCredits({
  actualCredits,
  context,
  reservedCredits,
  userId,
}: {
  actualCredits: number;
  context: string;
  reservedCredits: number;
  userId: string;
}): Promise<number> {
  if (actualCredits === reservedCredits) {
    return reservedCredits;
  }

  if (actualCredits < reservedCredits) {
    const refundAmount = reservedCredits - actualCredits;
    try {
      await restoreCredits({ amount: refundAmount, userId });
      return actualCredits;
    } catch (refundError) {
      logger.error('Failed to refund unused reserved credits', {
        extra: {
          actualCredits,
          context,
          errorMessage:
            refundError instanceof Error
              ? refundError.message
              : String(refundError),
          refundAmount,
          reservedCredits,
        },
        user: { id: userId },
      });
      captureException(refundError, {
        extra: { actualCredits, context, refundAmount, reservedCredits },
        user: { id: userId },
      });
      return reservedCredits;
    }
  }

  const additionalCredits = actualCredits - reservedCredits;
  try {
    const additionalCreditsDebited = await reduceCreditsUpTo({
      amount: additionalCredits,
      userId,
    });
    const totalCreditsDebited = reservedCredits + additionalCreditsDebited;

    if (additionalCreditsDebited < additionalCredits) {
      logger.warn('Partially debited additional reserved credits', {
        extra: {
          actualCredits,
          additionalCredits,
          additionalCreditsDebited,
          context,
          reservedCredits,
          totalCreditsDebited,
        },
        user: { id: userId },
      });
    }

    return totalCreditsDebited;
  } catch (debitError) {
    logger.error('Failed to debit additional reserved credits', {
      extra: {
        actualCredits,
        additionalCredits,
        context,
        errorMessage:
          debitError instanceof Error ? debitError.message : String(debitError),
        reservedCredits,
      },
      user: { id: userId },
    });
    captureException(debitError, {
      extra: { actualCredits, additionalCredits, context, reservedCredits },
      user: { id: userId },
    });
    return reservedCredits;
  }
}

function reportCancelledCharge({
  creditsDebited,
  model,
  signal,
  transport,
  userId,
}: {
  creditsDebited: number;
  model: string;
  signal: AbortSignal;
  transport: 'json';
  userId: string;
}) {
  if (!signal.aborted || creditsDebited <= 0) return;

  Sentry.captureMessage('Voice generation charge retained after cancellation', {
    extra: { creditsDebited, model },
    fingerprint: [CANCELLED_CHARGE_FLOW],
    level: 'warning',
    tags: { flow: CANCELLED_CHARGE_FLOW, transport },
    user: { id: userId },
  });
}

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 600; // seconds - fluid compute is enabled

// Initialize Redis
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  let text = '';
  let voiceId = '';
  let voiceName = '';
  let styleVariant = '';
  let seed: number | undefined;
  let selectedLanguage = '';
  let isSplit = false;
  const outputCodec = 'mp3';
  let user: GenerationIdentity | null = null;
  let userHasPaid = false;
  let modelUsed = '';
  let reservedCredits = 0;
  let creditsDebited = 0;
  try {
    if (request.body === null) {
      logger.error('Request body is empty');
      return APIErrorResponse('Request body is empty', 400);
    }

    let body: Awaited<ReturnType<typeof request.json>>;
    try {
      body = await request.json();
    } catch {
      return APIErrorResponse('Invalid JSON in request body', 400);
    }
    text = body.text || '';
    voiceId = body.voiceId || '';
    styleVariant = body.styleVariant || '';
    selectedLanguage = body.language || '';
    isSplit = body.split === true;
    const textImproved = body.textImproved === true;

    if (Number.isSafeInteger(body.seed) && body.seed >= 0) {
      seed = body.seed;
    }

    // Advanced generation settings. `seed` and `temperature` (Gemini) are paid
    // features and are gated by `userHasPaid` below; `speed` (Grok) is available
    // to everyone and is clamped to the supported range before use.
    const requestedTemperature =
      typeof body.temperature === 'number' && Number.isFinite(body.temperature)
        ? Math.min(2, Math.max(0, body.temperature))
        : undefined;
    const requestedSpeed =
      typeof body.speed === 'number' && Number.isFinite(body.speed)
        ? body.speed
        : undefined;

    if (!(text && voiceId)) {
      logger.error('Missing required parameters: text or voiceId', {
        hasText: Boolean(text),
        hasVoiceId: Boolean(voiceId),
      });
      return APIErrorResponse('Missing required parameters', 400);
    }

    const supabase = await createClient();

    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      logger.error('User not found', {
        voiceId,
      });
      return APIErrorResponse('User not found', 401);
    }

    user = { email: claims.email, id: claims.sub };

    Sentry.setUser({
      email: user.email,
      id: user.id,
    });

    const voiceObj = await getVoiceById(voiceId);

    if (!(voiceObj && isActiveTtsModel(voiceObj.model))) {
      const error = new Error('Voice not found');
      captureException(error, { extra: { text, voiceId } });
      return APIErrorResponse('Voice not found', 404);
    }

    voiceName = voiceObj.name;

    const provider = getTtsProvider(voiceObj.model);
    const isGeminiVoice = provider === 'gemini';
    const isGrokVoice = provider === 'grok';
    userHasPaid = await hasUserPaid(user.id);

    // Seed and temperature are paid-only knobs: ignore them for free users even
    // if the client forged them into the request. Manual seed is UI-locked and
    // the only other seed source (segment retries) is itself paid-only, so this
    // never strips a seed a free user legitimately set.
    if (!userHasPaid) {
      seed = undefined;
    }
    const temperature = userHasPaid ? requestedTemperature : undefined;
    // Clamp speed to the supported range before it reaches the cache key, so
    // out-of-range values (e.g. speed=100) can't mint unbounded distinct cache
    // entries that all collapse to the same clamped audio on generation.
    const speed = normalizeXaiTtsSpeed(requestedSpeed);

    const maxLength = getCharactersLimit(voiceObj.model, userHasPaid);
    if (text.length > maxLength) {
      return APIErrorResponse(
        `Text exceeds the maximum length of ${maxLength} characters`,
        400,
      );
    }
    if (isGeminiVoice && styleVariant) {
      const styleLimit = getGeminiStyleCharacterLimit(userHasPaid);
      if (styleVariant.length > styleLimit) {
        return APIErrorResponse(
          `Style exceeds the maximum length of ${styleLimit} characters`,
          400,
        );
      }
    }

    const currentAmount = await getCredits(user.id);

    const estimate = estimateCredits(text, voiceObj.name, voiceObj.model);

    // console.log({
    //   estimate,
    //   textLength: text.length,
    //   styleVariantLength: styleVariant.length,
    // });

    if (currentAmount < estimate) {
      logger.info('Insufficient credits', {
        extra: {
          currentCreditsAmount: currentAmount,
          estimate,
          textLength: text.length,
          voiceName: voiceObj.name,
        },
        user: { email: user.email, id: user.id },
      });
      return APIErrorResponse('Insufficient credits', 402);
    }

    // Resolve the provider model before constructing the cache key.
    const effectiveModel = isGeminiVoice
      ? resolveGeminiTtsModel({ model: voiceObj.model })
      : voiceObj.model;

    // Keep the base key stable so requests without advanced settings keep
    // hitting the existing cache; only seeded/temperature/speed variants get a
    // distinct entry so they never collide with the default output.
    let hashInput =
      seed === undefined
        ? `${text}-${voiceObj.name}-${effectiveModel}`
        : `${text}-${voiceObj.name}-${effectiveModel}-${seed}`;
    if (temperature !== undefined) {
      hashInput += `-temp:${temperature}`;
    }
    if (speed !== undefined) {
      hashInput += `-speed:${speed}`;
    }
    if (voiceObj.model === 'gpro38') {
      hashInput += `-style:${JSON.stringify(styleVariant ?? '')}`;
    }
    const hash = await generateHash(hashInput);

    const abortController = new AbortController();

    let folder = 'generated-audio-free';

    if (userHasPaid) {
      folder = 'generated-audio';
    }
    const path = `${folder}/${voiceObj.name}-${hash}`;

    request.signal.addEventListener('abort', () => {
      logger.info('Request aborted by client', {
        extra: {
          hash,
          text,
          voiceName: voiceObj.name,
        },
        user: {
          id: user?.id,
        },
      });
      abortController.abort();
    });

    // const requestedGrokCodec = normalizeXaiTtsCodec(outputCodec);
    const fileExtension = isGrokVoice ? 'mp3' : 'wav';
    const filename = `${path}.${fileExtension}`;
    const result = await redis.get<string>(filename);

    if (result) {
      logger.info('Cache hit - returning existing audio', {
        creditsUsed: 0,
        filename,
        url: result,
      });
      await sendPosthogEvent({
        creditUsed: 0,
        model: effectiveModel,
        split: isSplit,
        text,
        userId: user.id,
        voiceId: voiceObj.id,
      });

      return NextResponse.json(
        { cached: true, creditsUsed: 0, url: result },
        { status: 200 },
      );
    }

    let replicateResponse: Prediction | undefined;
    let genAIResponse: GenerateContentResponse | null = null;
    let uploadUrl = '';
    let selectedGrokCodec = outputCodec;
    let generatedAudioBuffer: Buffer | undefined;
    let generatedAudioMimeType: string | undefined;

    await reduceCredits({ amount: estimate, userId: user.id });
    reservedCredits = estimate;

    if (isGeminiVoice) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const geminiTTSConfig = buildGeminiTtsConfig({
        abortSignal: abortController.signal,
        model: voiceObj.model,
        seed,
        temperature,
        voiceName: voiceObj.name,
      });

      modelUsed = resolveGeminiTtsModel({ model: voiceObj.model });
      genAIResponse = await ai.models.generateContent({
        config: geminiTTSConfig,
        contents: buildGeminiTtsContents({
          model: voiceObj.model,
          styleVariant,
          text,
        }),
        model: modelUsed,
      });
      const { data, mimeType } = extractInlineAudio(genAIResponse);
      const finishReason = genAIResponse?.candidates?.[0]?.finishReason;
      const blockReason = genAIResponse?.promptFeedback?.blockReason;
      const responseOutcome = classifyGeminiTtsResponse({
        blockReason,
        finishReason,
        hasAudio: Boolean(data && mimeType),
      });
      const isProhibitedContent = responseOutcome === 'content_blocked';
      const isNoAudioData = responseOutcome === 'no_audio';

      if (responseOutcome !== 'success' || !data || !mimeType) {
        if (isProhibitedContent) {
          logger.warn('Content generation prohibited by Gemini', {
            extra: {
              blockReason,
              finishReason,
              model: modelUsed,
              provider,
              responseId: genAIResponse?.responseId,
              styleVariant,
              textLength: text.length,
              voice: voiceObj.name,
            },
            user: { email: user.email, id: user.id },
          });
        } else if (isNoAudioData) {
          logger.warn('Gemini voice generation returned no audio data', {
            extra: {
              blockReason,
              finishReason,
              model: modelUsed,
              provider,
              responseId: genAIResponse?.responseId,
              styleVariant,
              textLength: text.length,
              textPreview: text.slice(0, 500),
              voice: voiceName,
            },
            user: { email: user.email, id: user.id },
          });
        } else {
          logger.error('Gemini voice generation failed', {
            extra: {
              blockReason,
              error: finishReason,
              finishReason,
              hasData: !!data,
              mimeType,
              model: modelUsed,
              provider,
              response: genAIResponse,
              responseId: genAIResponse?.responseId,
              styleVariant,
              textLength: text.length,
              textPreview: text.slice(0, 500),
              voice: voiceObj.name,
            },
            user: { email: user.email, id: user.id },
          });
          if (process.env.NODE_ENV === 'development') {
            console.dir(
              {
                blockReason,
                error: finishReason,
                hasData: !!data,
                mimeType,
                model: modelUsed,
                response: genAIResponse,
              },
              { depth: null },
            );
          }
        }
        // Capture only response shapes that the classifier does not recognize.
        if (!(isProhibitedContent || isNoAudioData)) {
          captureException(new Error('Gemini 200 — no audio data'), {
            extra: {
              blockReason,
              finishReason,
              hasData: !!data,
              isNoAudioData,
              mimeType,
              model: modelUsed,
              textPreview: text.slice(0, 200),
              voice: voiceObj.name,
            },
            user: { id: user.id },
          });
        }
        const errorCode =
          geminiOutcomeToErrorCode(responseOutcome) ?? 'OTHER_GEMINI_BLOCK';
        throw new Error(getErrorMessage(errorCode, 'voice-generation'), {
          cause: errorCode,
        });
      }
      logger.info('Gemini voice generation succeeded', {
        extra: {
          model: modelUsed,
          provider,
          responseId: genAIResponse!.responseId,
          styleVariant,
          textLength: text.length,
          textPreview: text.slice(0, 500),
          voice: voiceObj.name,
        },
        user: {
          email: user.email,
          id: user.id,
        },
      });

      const audioBuffer = convertToWav(data, mimeType);
      generatedAudioBuffer = audioBuffer;
      generatedAudioMimeType = 'audio/wav';
      uploadUrl = await uploadFileToR2(filename, audioBuffer, 'audio/wav');
    } else if (isGrokVoice) {
      modelUsed = voiceObj.model;

      let xaiResult: Awaited<ReturnType<typeof generateXaiTts>>;
      try {
        xaiResult = await generateXaiTts({
          codec: outputCodec,
          language: selectedLanguage || voiceObj.language,
          signal: abortController.signal,
          speed,
          text,
          voiceId: voiceObj.name,
        });
      } catch (error) {
        if (isTransientProviderFailure(error)) {
          logger.warn('Grok TTS provider unavailable', {
            extra: {
              codec: outputCodec,
              errorMessage: getProviderErrorMessage(error),
              errorName: getProviderErrorName(error),
              language: selectedLanguage || voiceObj.language,
              model: voiceObj.model,
              voice: voiceObj.name,
            },
            user: {
              email: user.email,
              id: user.id,
            },
          });
          throw createProviderUnavailableError('grok', error);
        }

        const sentryContext = {
          extra: {
            codec: outputCodec,
            language: selectedLanguage || voiceObj.language,
            model: voiceObj.model,
            text,
            voice: voiceObj.name,
          },
          user: {
            email: user.email,
            id: user.id,
          },
        };
        logger.error('Grok TTS generation failed', {
          extra: {
            ...sentryContext.extra,
            errorCause: Error.isError(error) ? error.cause : undefined,
            errorMessage: getProviderErrorMessage(error),
          },
          user: sentryContext.user,
        });
        captureException(error, sentryContext);
        throw Object.assign(
          new Error(getErrorMessage('XAI_TTS_ERROR', 'voice-generation'), {
            cause: error,
          }),
          { voiceGenerationErrorCode: 'XAI_TTS_ERROR' },
        );
      }

      const { audioBuffer, codec, contentType } = xaiResult;
      selectedGrokCodec = codec;
      generatedAudioBuffer = audioBuffer;
      generatedAudioMimeType = contentType;
      uploadUrl = await uploadFileToR2(filename, audioBuffer, contentType);
    } else {
      // uses REPLICATE_API_TOKEN
      modelUsed = voiceObj.model;
      const replicate = new Replicate();
      const onProgress = (prediction: Prediction) => {
        replicateResponse = prediction;
      };
      let output: ReadableStream;
      try {
        output = (await replicate.run(
          voiceObj.model as `${string}/${string}`,
          { input: { text, voice: voiceObj.name }, signal: request.signal },
          onProgress,
        )) as ReadableStream;
      } catch (error) {
        if (isTransientProviderFailure(error)) {
          logger.warn('Replicate voice generation provider unavailable', {
            extra: {
              errorMessage: getProviderErrorMessage(error),
              errorName: getProviderErrorName(error),
              model: voiceObj.model,
              voice: voiceObj.name,
            },
            user: { email: user.email, id: user.id },
          });
          throw createProviderUnavailableError('replicate', error);
        }

        throw Object.assign(
          new Error(getErrorMessage('REPLICATE_ERROR', 'voice-generation'), {
            cause: error,
          }),
          { voiceGenerationErrorCode: 'REPLICATE_ERROR' },
        );
      }

      // Convert ReadableStream to Buffer before uploading
      const audioBuffer = Buffer.from(await new Response(output).arrayBuffer());
      generatedAudioBuffer = audioBuffer;
      generatedAudioMimeType = 'audio/mpeg';

      uploadUrl = await uploadFileToR2(filename, audioBuffer, 'audio/mpeg');
    }

    await redis.set(filename, uploadUrl);

    let creditsUsed = estimate;

    const usage = extractMetadata(
      isGeminiVoice,
      genAIResponse,
      replicateResponse,
    );

    if (isGeminiVoice && usage) {
      creditsUsed = calculateCreditsFromTokens(
        Number.parseInt(usage.totalTokenCount, 10),
      );
    }

    creditsDebited = await reconcileReservedCredits({
      actualCredits: creditsUsed,
      context: 'generate_voice_success',
      reservedCredits,
      userId: user.id,
    });
    reservedCredits = 0;

    let dollarAmount: number | undefined;
    if (isGrokVoice) {
      dollarAmount = calculateGenerateApiDollarAmount({
        inputChars: text.length,
        model: modelUsed,
        provider: 'xai',
        sourceType: 'tts',
      });
    } else if (isGeminiVoice && usage && 'promptTokenCount' in usage) {
      dollarAmount = calculateGenerateApiDollarAmount({
        candidatesTokenCount: usage.candidatesTokenCount,
        inputChars: text.length,
        model: modelUsed,
        promptTokenCount: usage.promptTokenCount,
        provider: 'google',
        sourceType: 'tts',
      });
    }

    after(async () => {
      if (!user) {
        captureException(new Error('User not found'));
        return;
      }

      const duration = await resolveDurationString(
        generatedAudioBuffer,
        generatedAudioMimeType,
      );

      const audioFileDBResult = await saveAudioFile({
        credits_used: creditsDebited,
        duration,
        filename,
        isPublic: false,
        model: modelUsed,
        predictionId: replicateResponse?.id,
        text,
        url: uploadUrl,
        usage: {
          ...usage,
          split: isSplit,
          textImproved,
          userHasPaid,
        },
        userId: user.id,
        voiceId: voiceObj.id,
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          errorData: audioFileDBResult.error,
          model: modelUsed,
          text,
          voice: voiceObj.name,
        };
        const error = new Error('Failed to insert audio file row');
        captureException(error, {
          extra: errorObj,
        });
        console.error(errorObj);
      }

      // Insert usage event for tracking (non-blocking)
      await insertUsageEvent({
        creditsUsed: creditsDebited,
        inputChars: text.length,
        model: modelUsed,
        quantity: text.length,
        sourceId: audioFileDBResult.data?.id,
        sourceType: 'tts',
        unit: 'chars',
        userId: user.id,
        ...(dollarAmount === undefined ? {} : { dollarAmount }),
        metadata: {
          ...usage,
          duration,
          model: modelUsed,
          predictionId: replicateResponse?.id ?? null,
          provider,
          split: isSplit,
          textLength: text.length,
          textPreview: text.slice(0, 100),
          userHasPaid,
          voiceId: voiceObj.id,
          voiceName: voiceObj.name,
          ...(isGrokVoice ? { codec: selectedGrokCodec } : {}),
        },
      });

      await sendPosthogEvent({
        creditUsed: creditsDebited,
        model: modelUsed,
        predictionId: replicateResponse?.id,
        split: isSplit,
        text,
        userId: user.id,
        voiceId: voiceObj.id,
      });
    });

    return NextResponse.json(
      {
        creditsUsed: creditsDebited,
        url: uploadUrl,
      },
      { status: 200 },
    );
  } catch (error) {
    if (reservedCredits > 0 && user) {
      await refundReservedCredits({
        amount: reservedCredits,
        context: 'generate_voice_failure',
        userId: user.id,
      });
      reservedCredits = 0;
    }

    if (isInsufficientCreditsError(error)) {
      logger.info('Insufficient credits during reservation', {
        extra: { textLength: text.length, voiceName },
        user: user ? { email: user.email, id: user.id } : undefined,
      });
      return APIErrorResponse('Insufficient credits', 402);
    }

    // Client disconnected — do not attempt to write to a dead socket (prevents write EPIPE)
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    if (isAbortError(error)) {
      console.info('Gemini voice generation aborted');
      return APIErrorResponse('Request aborted', 499);
    }

    if (Error.isError(error) && error.cause === 'PROHIBITED_CONTENT') {
      return APIErrorResponse(
        error.message || 'Voice generation failed, please retry',
        getErrorStatusCode(error.cause),
      );
    }

    if (Error.isError(error) && error.cause === 'OTHER_GEMINI_BLOCK') {
      return APIErrorResponse(
        error.message || 'Voice generation failed, please retry',
        getErrorStatusCode(error.cause),
      );
    }

    if (Error.isError(error) && error.cause === 'NO_AUDIO_DATA') {
      return APIErrorResponse(
        error.message || 'Voice generation returned no audio',
        getErrorStatusCode(error.cause),
      );
    }

    if (
      Error.isError(error) &&
      'voiceGenerationErrorCode' in error &&
      error.voiceGenerationErrorCode === ERROR_CODES.PROVIDER_UNAVAILABLE &&
      'provider' in error &&
      isProviderId(error.provider)
    ) {
      return providerUnavailableResponse(error.provider);
    }

    const googleApiError = parseGoogleApiError(error);
    if (googleApiError) {
      const googleStatus = getGoogleApiErrorStatus(googleApiError);
      if (isGoogleQuotaError(googleApiError)) {
        logger.warn('Gemini quota exhausted', {
          extra: {
            googleCode: googleApiError.code,
            googleStatus,
            textLength: text.length,
            voice: voiceName,
          },
          user: user ? { email: user.email, id: user.id } : undefined,
        });

        return APIErrorResponse(
          getErrorMessage(
            userHasPaid
              ? ERROR_CODES.THIRD_P_QUOTA_EXCEEDED
              : ERROR_CODES.FREE_QUOTA_EXCEEDED,
            'voice-generation',
          ),
          429,
        );
      }

      if (isGoogleTransientProviderError(googleApiError)) {
        logger.warn('Gemini provider temporarily unavailable', {
          extra: {
            googleCode: googleApiError.code,
            googleStatus,
            textLength: text.length,
            voice: voiceName,
          },
          user: user ? { email: user.email, id: user.id } : undefined,
        });

        return providerUnavailableResponse('gemini');
      }

      if (googleStatus === 'INVALID_ARGUMENT') {
        logger.warn('Gemini rejected TTS request', {
          extra: {
            googleCode: googleApiError.code,
            googleStatus,
            textLength: text.length,
            voice: voiceName,
          },
          user: user ? { email: user.email, id: user.id } : undefined,
        });

        if (isGeminiInputTooLongError(error)) {
          return APIErrorResponse(
            getErrorMessage(
              ERROR_CODES.GEMINI_INPUT_TOO_LONG,
              'voice-generation',
            ),
            getErrorStatusCode(ERROR_CODES.GEMINI_INPUT_TOO_LONG),
          );
        }

        return APIErrorResponse(
          getErrorMessage(ERROR_CODES.OTHER_GEMINI_BLOCK, 'voice-generation'),
          422,
        );
      }
    }

    const errorObj = {
      errorData: error,
      ...(modelUsed ? { model: modelUsed } : {}),
      text,
      voice: voiceName,
    };
    captureException(error, {
      extra: errorObj,
      user: user ? { email: user.email, id: user.id } : undefined,
    });
    console.error(errorObj);
    console.error('Voice generation error:', error);

    if (Error.isError(error)) {
      const errorCode =
        'voiceGenerationErrorCode' in error
          ? error.voiceGenerationErrorCode
          : error.cause;
      if (Object.keys(ERROR_CODES).includes(String(errorCode))) {
        return APIErrorResponse(
          error.message || 'Voice generation failed, please retry',
          getErrorStatusCode(errorCode),
        );
      }
    }

    return APIErrorResponse('Failed to generate voice', 500);
  } finally {
    if (user) {
      reportCancelledCharge({
        creditsDebited,
        model: modelUsed,
        signal: request.signal,
        transport: 'json',
        userId: user.id,
      });
    }
  }
}

async function sendPosthogEvent({
  userId,
  text,
  voiceId,
  predictionId,
  creditUsed,
  model,
  split,
}: {
  userId: string;
  text: string;
  voiceId: string;
  predictionId?: string;
  creditUsed: number;
  model: string;
  split?: boolean;
}) {
  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'generate-voice',
    properties: {
      credits_used: creditUsed,
      model,
      // duration,
      predictionId,
      split,
      text,
      textLength: text.length,
      voiceId,
    },
  });
  await posthog.shutdown();
}
