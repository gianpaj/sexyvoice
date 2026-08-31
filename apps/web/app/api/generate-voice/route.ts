import {
  type FinishReason,
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import {
  estimateTokenCount,
  extractInlineAudio,
  GEMINI_STREAMING_ENABLED,
  getCharactersLimit,
  getGeminiCombinedTokenLimit,
  getGeminiStyleCharacterLimit,
} from '@/lib/ai';
import { calculateGenerateApiDollarAmount } from '@/lib/api/pricing';
import { convertToWav, generateHash, resolveDurationString } from '@/lib/audio';
import { APIErrorResponse } from '@/lib/error-ts';
import PostHogClient from '@/lib/posthog';
import { uploadFileToR2 } from '@/lib/storage/upload';
import {
  getCredits,
  getVoiceById,
  hasUserPaid,
  insertUsageEvent,
  isFreemiumUserOverLimit,
  isInsufficientCreditsError,
  reduceCredits,
  reduceCreditsUpTo,
  restoreCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import {
  buildGeminiTtsPrompt,
  resolveGeminiTtsModel,
} from '@/lib/tts/gemini-prompt';
import { classifyGeminiTtsResponse } from '@/lib/tts/gemini-response';
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
import {
  getGoogleApiErrorStatus,
  isGoogleQuotaError,
  isGoogleTransientProviderError,
} from '@/utils/google-rpc-status';
import { parseGoogleApiError } from '@/utils/googleErrors';
import {
  buildGeminiTtsConfig,
  convertAudioChunksToWav,
  createSseEvent,
  extractGeminiStreamAudioChunk,
  SSE_HEADERS,
} from './gemini-tts';

const { logger, captureException } = Sentry;

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
  let user: User | null = null;
  let userHasPaid = false;
  let reservedCredits = 0;
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
    const stream = body.stream === true;

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

    const { data } = await supabase.auth.getUser();
    user = data?.user;

    if (!user) {
      logger.error('User not found', {
        voiceId,
      });
      return APIErrorResponse('User not found', 401);
    }

    Sentry.setUser({
      email: user.email,
      id: user.id,
    });

    const voiceObj = await getVoiceById(voiceId);

    if (!voiceObj) {
      const error = new Error('Voice not found');
      captureException(error, { extra: { text, voiceId } });
      return APIErrorResponse('Voice not found', 404);
    }

    voiceName = voiceObj.name;

    const provider = getTtsProvider(voiceObj.model);
    const isGeminiVoice = provider === 'gemini';
    const isGrokVoice = provider === 'grok';
    // Streaming is only honoured for the gemini-3.1 (gpro31) voices, which
    // return audio progressively. The 2.5 models emit the whole clip in a
    // single chunk, so streaming gives no benefit — they keep the JSON path,
    // as do Grok/Replicate voices.
    const clientRequestedStream =
      stream && isGeminiVoice && voiceObj.model === 'gpro31';
    // HOTFIX: gated behind GEMINI_STREAMING_ENABLED (currently false) because
    // progressive streaming corrupted some gpro31 generations.
    const shouldStream = GEMINI_STREAMING_ENABLED && clientRequestedStream;

    // HOTFIX: while streaming is disabled, a stale browser bundle from a
    // previous deploy may still POST `stream: true` and wait for an SSE `done`
    // event. The non-streaming JSON response never satisfies that contract, so
    // the client would hang after audio was generated and credits debited.
    // Fail fast with an explicit non-OK response — before any credit
    // reservation — so the stale client surfaces an error and the user reloads
    // to pick up the non-streaming bundle.
    if (clientRequestedStream && !shouldStream) {
      logger.warn('Rejected stream request while streaming is disabled', {
        extra: { model: voiceObj.model, voice: voiceObj.name },
        user: { id: user.id },
      });
      return APIErrorResponse(
        'Streaming is temporarily disabled. Please refresh the page and try again.',
        409,
      );
    }

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

    // Enforce per-tier input limits on the RAW transcript and style before
    // combining them, so the attacker-controlled (and otherwise unbounded)
    // styleVariant cannot bypass the limits or under-estimate credits.
    // HOTFIX: while streaming is disabled (GEMINI_STREAMING_ENABLED === false)
    // gpro31 falls back to the standard per-tier character limits below, like
    // the Gemini 2.5 voices, instead of the larger combined token budget.
    const isGemini31 =
      GEMINI_STREAMING_ENABLED && isGeminiVoice && voiceObj.model === 'gpro31';

    if (isGemini31) {
      // Gemini 3.1 streams audio, so the transcript and style share one combined
      // token budget instead of separate character caps.
      const combinedTokenLimit = getGeminiCombinedTokenLimit(userHasPaid);
      const estimatedTokens = estimateTokenCount(
        styleVariant ? `${styleVariant}\n${text}` : text,
      );
      if (estimatedTokens > combinedTokenLimit) {
        logger.error('Gemini 3.1 input exceeds token limit', {
          combinedTokenLimit,
          estimatedTokens,
        });
        return APIErrorResponse(
          `Text and style exceed the maximum of ${combinedTokenLimit} tokens`,
          400,
        );
      }
    } else {
      const maxLength = getCharactersLimit(voiceObj.model, userHasPaid);
      if (text.length > maxLength) {
        logger.error('Text exceeds maximum length', {
          maxLength,
          textLength: text.length,
        });
        return APIErrorResponse(
          `Text exceeds the maximum length of ${maxLength} characters`,
          400,
        );
      }

      // Gemini 2.5 voices accept a separate, character-bounded style prompt.
      // (styleVariant is ignored for non-Gemini voices.)
      if (isGeminiVoice && styleVariant) {
        const styleLimit = getGeminiStyleCharacterLimit(userHasPaid);
        if (styleVariant.length > styleLimit) {
          logger.error('Style exceeds maximum length', {
            styleLength: styleVariant.length,
            styleLimit,
          });
          return APIErrorResponse(
            `Style exceeds the maximum length of ${styleLimit} characters`,
            400,
          );
        }
      }
    }

    // Build the effective payload sent to the provider. The gemini-3.1 (gpro31)
    // model follows direction best when the style and transcript are sent as
    // labelled sections rather than an inline prefix.
    if (isGeminiVoice && styleVariant) {
      text = buildGeminiTtsPrompt({
        model: voiceObj.model,
        styleVariant,
        text,
      });
    }

    if (!userHasPaid && voiceObj.model === 'gpro') {
      const isOverLimit = await isFreemiumUserOverLimit(user.id);
      if (isOverLimit) {
        return NextResponse.json(
          { errorCode: 'gproLimitExceeded' },
          { status: 403 },
        );
      }
    }

    const currentAmount = await getCredits(user.id);

    const estimate = estimateCredits(
      text,
      voiceObj.name,
      voiceObj.model,
      userHasPaid,
    );

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

    // Resolve the effective model before hashing so paid/free, 2.5/3.1, and
    // seeded requests never share a cache entry.
    const effectiveModel = isGeminiVoice
      ? resolveGeminiTtsModel({ model: voiceObj.model, userHasPaid })
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
        stream: shouldStream,
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

      if (shouldStream) {
        const body = createSseEvent('done', {
          cached: true,
          creditsRemaining: currentAmount,
          creditsUsed: 0,
          url: result,
        });
        return new Response(body, { headers: SSE_HEADERS });
      }

      // Return existing audio file URL
      return NextResponse.json({ url: result }, { status: 200 });
    }

    let replicateResponse: Prediction | undefined;
    let genAIResponse: GenerateContentResponse | null = null;
    let modelUsed = '';
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
        seed,
        temperature,
        voiceName: voiceObj.name,
      });

      if (shouldStream) {
        return streamGeminiTtsResponse({
          ai,
          config: geminiTTSConfig,
          currentAmount,
          estimate,
          filename,
          provider,
          requestSignal: request.signal,
          reservedCredits: estimate,
          styleVariant,
          text,
          user,
          userHasPaid,
          voiceObj,
        });
      }

      if (userHasPaid) {
        try {
          modelUsed = resolveGeminiTtsModel({
            model: voiceObj.model,
            userHasPaid,
          });

          genAIResponse = await ai.models.generateContent({
            config: geminiTTSConfig,
            contents: [{ parts: [{ text }], role: 'user' }],
            model: modelUsed,
          });
        } catch (error) {
          console.warn(error);
          if (error instanceof Error && error.name === 'AbortError') {
            console.info('Gemini voice generation aborted');
            await refundReservedCredits({
              amount: reservedCredits,
              context: 'gemini_generate_abort',
              userId: user.id,
            });
            reservedCredits = 0;
            return APIErrorResponse('Request aborted', 499);
          }

          const proErrorMessage =
            error instanceof Error ? error.message : String(error);
          const geminiRequestContext = {
            provider,
            requestedOutputCodec: outputCodec || null,
            responseModalities: geminiTTSConfig.responseModalities,
            speechConfig: geminiTTSConfig.speechConfig,
            styleVariant,
            textLength: text.length,
            textPreview: text.slice(0, 500),
            voice: voiceObj.name,
          };

          logger.warn(
            `${modelUsed} failed, retrying with gemini-2.5-flash-preview-tts`,
            {
              extra: {
                ...geminiRequestContext,
                errorCause: error instanceof Error ? error.cause : undefined,
                errorMessage: proErrorMessage,
                model: modelUsed,
              },
              user: {
                email: user.email,
                id: user.id,
              },
            },
          );
          modelUsed = 'gemini-2.5-flash-preview-tts'; // inputTokenLimit = 8192, outputTokenLimit = 16384
          try {
            genAIResponse = await ai.models.generateContent({
              config: geminiTTSConfig,
              contents: [{ parts: [{ text }], role: 'user' }],
              model: modelUsed,
            });

            logger.info('Gemini flash fallback succeeded after pro failure', {
              extra: {
                ...geminiRequestContext,
                fallbackModel: modelUsed,
                originalModel: resolveGeminiTtsModel({
                  model: voiceObj.model,
                  userHasPaid,
                }),
                proErrorMessage,
              },
              user: {
                email: user.email,
                id: user.id,
              },
            });
          } catch (flashError) {
            logger.error('Gemini flash fallback failed after pro failure', {
              extra: {
                ...geminiRequestContext,
                fallbackModel: modelUsed,
                flashErrorCause:
                  flashError instanceof Error ? flashError.cause : undefined,
                flashErrorMessage:
                  flashError instanceof Error
                    ? flashError.message
                    : String(flashError),
                originalModel: resolveGeminiTtsModel({
                  model: voiceObj.model,
                  userHasPaid,
                }),
                proErrorMessage,
              },
              user: {
                email: user.email,
                id: user.id,
              },
            });
            throw flashError;
          }
        }
      } else {
        modelUsed = resolveGeminiTtsModel({
          model: voiceObj.model,
          userHasPaid,
        });
        genAIResponse = await ai.models.generateContent({
          config: geminiTTSConfig,
          contents: [{ parts: [{ text }], role: 'user' }],
          model: modelUsed,
        });
      }
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
        let noAudioErrorCode: keyof typeof ERROR_CODES = 'OTHER_GEMINI_BLOCK';
        if (isProhibitedContent) {
          noAudioErrorCode = 'PROHIBITED_CONTENT';
        } else if (isNoAudioData) {
          noAudioErrorCode = 'NO_AUDIO_DATA';
        }
        throw new Error(getErrorMessage(noAudioErrorCode, 'voice-generation'), {
          cause: noAudioErrorCode,
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

      try {
        const { audioBuffer, codec, contentType } = await generateXaiTts({
          codec: outputCodec,
          language: selectedLanguage || voiceObj.language,
          signal: abortController.signal,
          speed,
          text,
          voiceId: voiceObj.name,
        });
        selectedGrokCodec = codec;
        generatedAudioBuffer = audioBuffer;
        generatedAudioMimeType = contentType;
        uploadUrl = await uploadFileToR2(filename, audioBuffer, contentType);
      } catch (error) {
        const errorObj = {
          codec: outputCodec,
          errorData: error,
          language: selectedLanguage || voiceObj.language,
          model: voiceObj.model,
          text,
          voice: voiceObj.name,
        };
        logger.error('Grok TTS generation failed', {
          extra: {
            codec: outputCodec,
            errorCause: Error.isError(error) ? error.cause : undefined,
            errorMessage: Error.isError(error) ? error.message : String(error),
            language: selectedLanguage || voiceObj.language,
            model: voiceObj.model,
            text,
            voice: voiceObj.name,
          },
          user: {
            email: user.email,
            id: user.id,
          },
        });
        captureException(error, {
          extra: errorObj,
          user: { email: user.email, id: user.id },
        });
        console.error('Grok TTS generation failed', errorObj);
        throw Object.assign(
          new Error(getErrorMessage('XAI_TTS_ERROR', 'voice-generation'), {
            cause: error,
          }),
          { voiceGenerationErrorCode: 'XAI_TTS_ERROR' },
        );
      }
    } else {
      // uses REPLICATE_API_TOKEN
      modelUsed = voiceObj.model;
      const replicate = new Replicate();
      const onProgress = (prediction: Prediction) => {
        replicateResponse = prediction;
      };
      const output = (await replicate.run(
        voiceObj.model as `${string}/${string}`,
        { input: { text, voice: voiceObj.name }, signal: request.signal },
        onProgress,
      )) as ReadableStream;

      if ('error' in output) {
        const errorObj = {
          errorData: output.error,
          model: voiceObj.model,
          text,
          voice: voiceObj.name,
        };
        const error = new Error('Voice generation failed', {
          cause: 'REPLICATE_ERROR',
        });
        captureException(error, {
          extra: errorObj,
          user: { email: user.email, id: user.id },
        });
        console.error(errorObj);
        throw new Error(
          getErrorMessage('REPLICATE_ERROR', 'voice-generation'),
          {
            cause: 'REPLICATE_ERROR',
          },
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
      // Bill against the model that actually ran (`modelUsed`), not the stored
      // voice model: a 3.1 request that fell back to 2.5 Flash must not incur
      // the 3.1 free-user surcharge.
      creditsUsed = calculateCreditsFromTokens(
        Number.parseInt(usage.totalTokenCount, 10),
        { model: modelUsed, userHasPaid },
      );
    }

    const creditsDebited = await reconcileReservedCredits({
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
        quantity: text.length,
        sourceId: audioFileDBResult.data?.id,
        sourceType: 'tts',
        unit: 'chars',
        userId: user.id,
        ...(dollarAmount === undefined ? {} : { dollarAmount }),
        metadata: {
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
        creditsRemaining: (currentAmount || 0) - creditsDebited,
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

        return APIErrorResponse(
          getErrorMessage(
            ERROR_CODES.GEMINI_PROVIDER_UNAVAILABLE,
            'voice-generation',
          ),
          503,
        );
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
  }
}

// ── Gemini streaming helper ────────────────────────────────────────────────

function streamGeminiTtsResponse({
  ai,
  text,
  config,
  voiceObj,
  user,
  userHasPaid,
  filename,
  estimate,
  currentAmount,
  styleVariant,
  provider,
  requestSignal,
  reservedCredits,
}: {
  ai: GoogleGenAI;
  text: string;
  config: GenerateContentConfig;
  voiceObj: { id: string; name: string; model: string; language: string };
  user: { id: string; email?: string };
  userHasPaid: boolean;
  filename: string;
  estimate: number;
  currentAmount: number;
  styleVariant: string;
  provider: string;
  requestSignal: AbortSignal;
  reservedCredits: number;
}): Response {
  const encoder = new TextEncoder();
  const selectedModel = resolveGeminiTtsModel({
    model: voiceObj.model,
    userHasPaid,
  });

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const enqueue = (
    event: 'audio' | 'done' | 'error',
    payload: Record<string, unknown>,
  ) => writer.write(encoder.encode(createSseEvent(event, payload)));

  // Run generation asynchronously so we can return the Response immediately.
  (async () => {
    const audioChunks: string[] = [];
    let mimeType = 'audio/L16;rate=24000';
    let modelUsed = selectedModel;
    let streamUsageMetadata:
      | GenerateContentResponse['usageMetadata']
      | undefined;
    let streamFinishReason: FinishReason | undefined;
    let streamBlockReason: string | undefined;
    let audioStarted = false;
    let completed = false;

    const getStreamBlockError = () => {
      const responseOutcome = classifyGeminiTtsResponse({
        blockReason: streamBlockReason,
        finishReason: streamFinishReason,
        hasAudio: audioChunks.length > 0,
      });
      let errorCode: keyof typeof ERROR_CODES | undefined;
      if (responseOutcome === 'content_blocked') {
        errorCode = 'PROHIBITED_CONTENT';
      } else if (responseOutcome === 'no_audio') {
        errorCode = 'NO_AUDIO_DATA';
      } else if (
        responseOutcome === 'unexpected' &&
        (streamFinishReason || streamBlockReason)
      ) {
        errorCode = 'OTHER_GEMINI_BLOCK';
      }

      return errorCode
        ? new Error(getErrorMessage(errorCode, 'voice-generation'), {
            cause: errorCode,
          })
        : undefined;
    };

    const tryStream = async (model: string) => {
      const stream = await ai.models.generateContentStream({
        config,
        contents: [{ parts: [{ text }] }],
        model,
      });

      for await (const chunk of stream) {
        if (requestSignal.aborted) return;

        const audioChunk = extractGeminiStreamAudioChunk(chunk);
        if (audioChunk) {
          audioStarted = true;
          audioChunks.push(audioChunk.data);
          mimeType = audioChunk.mimeType;
          await enqueue('audio', {
            data: audioChunk.data,
            mimeType: audioChunk.mimeType,
          });
        }
        if (chunk.usageMetadata) {
          streamUsageMetadata = chunk.usageMetadata;
        }
        const finishReason = chunk.candidates?.[0]?.finishReason;
        if (finishReason) {
          streamFinishReason = finishReason;
        }
        const blockReason = chunk.promptFeedback?.blockReason;
        if (blockReason) {
          streamBlockReason = blockReason;
        }
      }
    };

    try {
      logger.info('Gemini stream requested', {
        extra: { model: selectedModel, stream: true, textLength: text.length },
        user: { email: user.email, id: user.id },
      });

      try {
        await tryStream(selectedModel);
        if (audioChunks.length === 0) {
          const streamBlockError = getStreamBlockError();
          if (streamBlockError) {
            throw streamBlockError;
          }
          throw new Error(
            `${selectedModel} stream completed without audio chunks`,
          );
        }
      } catch (primaryError) {
        if (requestSignal.aborted || isAbortError(primaryError)) {
          logger.info('Gemini stream aborted', { user: { id: user.id } });
          return;
        }

        if (
          Error.isError(primaryError) &&
          (primaryError.cause === 'PROHIBITED_CONTENT' ||
            primaryError.cause === 'OTHER_GEMINI_BLOCK')
        ) {
          throw primaryError;
        }

        if (audioStarted) {
          // Cannot switch models after audio has started — mixed models in one file.
          throw primaryError;
        }

        const proErrorMessage =
          primaryError instanceof Error
            ? primaryError.message
            : String(primaryError);
        logger.warn(
          `${selectedModel} stream failed before first chunk, retrying with gemini-2.5-flash-preview-tts`,
          {
            extra: {
              errorMessage: proErrorMessage,
              originalModel: selectedModel,
              stream: true,
              voice: voiceObj.name,
            },
            user: { email: user.email, id: user.id },
          },
        );
        modelUsed = 'gemini-2.5-flash-preview-tts';
        audioChunks.length = 0;
        streamUsageMetadata = undefined;
        streamFinishReason = undefined;
        streamBlockReason = undefined;
        await tryStream(modelUsed);
      }

      if (requestSignal.aborted) {
        return;
      }

      if (audioChunks.length === 0) {
        const streamBlockError = getStreamBlockError();
        if (streamBlockError) {
          throw streamBlockError;
        }
        logger.error('Gemini stream completed with no audio chunks', {
          extra: { model: modelUsed, stream: true, textLength: text.length },
          user: { email: user.email, id: user.id },
        });
        captureException(new Error('Gemini stream — no audio chunks'), {
          extra: { model: modelUsed, voice: voiceObj.name },
          user: { id: user.id },
        });
        await enqueue('error', {
          error: getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
        });
        return;
      }

      // Build final WAV and persist.
      logger.info('Gemini stream completed, uploading WAV', {
        extra: { chunks: audioChunks.length, model: modelUsed, stream: true },
        user: { email: user.email, id: user.id },
      });

      const wavBuffer = convertAudioChunksToWav(audioChunks, mimeType);
      const uploadUrl = await uploadFileToR2(filename, wavBuffer, 'audio/wav');
      await redis.set(filename, uploadUrl);

      const duration = await resolveDurationString(wavBuffer, 'audio/wav');

      // Billing — calculate credits from stream tokens when available.
      let creditsUsed = estimate;
      if (streamUsageMetadata?.totalTokenCount) {
        // Bill against the model that actually ran (`modelUsed`), which the
        // stream sets to 2.5 Flash on fallback — so a downgraded 3.1 request
        // is not charged the 3.1 free-user surcharge.
        creditsUsed = calculateCreditsFromTokens(
          streamUsageMetadata.totalTokenCount,
          { model: modelUsed, userHasPaid },
        );
      }
      const creditsDebited = await reconcileReservedCredits({
        actualCredits: creditsUsed,
        context: 'generate_voice_stream_success',
        reservedCredits,
        userId: user.id,
      });
      // Reconcile has settled the balance — clear the reservation so a later
      // failure (e.g. posthog flush) doesn't trigger a double-refund in the
      // `finally` block. Mirrors the non-stream path (reservedCredits = 0).
      reservedCredits = 0;

      const streamUsage: Record<string, string | number | boolean> =
        streamUsageMetadata
          ? {
              candidatesTokenCount: String(
                streamUsageMetadata.candidatesTokenCount ?? '',
              ),
              promptTokenCount: String(
                streamUsageMetadata.promptTokenCount ?? '',
              ),
              stream: true,
              totalTokenCount: String(
                streamUsageMetadata.totalTokenCount ?? '',
              ),
              userHasPaid,
            }
          : { stream: true, userHasPaid };

      const audioFileDBResult = await saveAudioFile({
        credits_used: creditsDebited,
        duration,
        filename,
        isPublic: false,
        model: modelUsed,
        predictionId: undefined,
        text,
        url: uploadUrl,
        usage: streamUsage,
        userId: user.id,
        voiceId: voiceObj.id,
      });

      if (audioFileDBResult.error) {
        captureException(
          new Error('Failed to insert audio file row (stream)'),
          {
            extra: { error: audioFileDBResult.error, model: modelUsed },
          },
        );
      }

      await insertUsageEvent({
        creditsUsed: creditsDebited,
        metadata: {
          duration,
          model: modelUsed,
          predictionId: null,
          provider,
          stream: true,
          textLength: text.length,
          textPreview: text.slice(0, 100),
          userHasPaid,
          voiceId: voiceObj.id,
          voiceName: voiceObj.name,
        },
        quantity: text.length,
        sourceId: audioFileDBResult.data?.id,
        sourceType: 'tts',
        unit: 'chars',
        userId: user.id,
      });

      await sendPosthogEvent({
        creditUsed: creditsDebited,
        model: modelUsed,
        text,
        userId: user.id,
        voiceId: voiceObj.id,
      });

      logger.info('Gemini stream done', {
        extra: { creditsUsed: creditsDebited, model: modelUsed, stream: true },
        user: { email: user.email, id: user.id },
      });

      completed = true;
      await enqueue('done', {
        creditsRemaining: (currentAmount || 0) - creditsDebited,
        creditsUsed: creditsDebited,
        url: uploadUrl,
      });
    } catch (error) {
      if (requestSignal.aborted || isAbortError(error)) {
        logger.info('Gemini stream aborted mid-flight', {
          user: { id: user.id },
        });
        return;
      }

      const rawMessage =
        error instanceof Error ? error.message : 'Voice generation failed';
      // Send a clean, user-facing message to the client instead of the raw
      // provider JSON (e.g. Gemini's nested INVALID_ARGUMENT token-limit error).
      let clientMessage = rawMessage;
      if (isGeminiInputTooLongError(error)) {
        clientMessage = getErrorMessage(
          ERROR_CODES.GEMINI_INPUT_TOO_LONG,
          'voice-generation',
        );
      } else if (parseGoogleApiError(error)) {
        clientMessage = getErrorMessage(
          'OTHER_GEMINI_BLOCK',
          'voice-generation',
        );
      }
      logger.error('Gemini stream failed', {
        extra: {
          audioStarted,
          errorMessage: rawMessage,
          model: modelUsed,
          stream: true,
          styleVariant,
          textLength: text.length,
          voice: voiceObj.name,
        },
        user: { email: user.email, id: user.id },
      });

      const isProhibitedContent =
        Error.isError(error) && error.cause === 'PROHIBITED_CONTENT';
      const isNoAudioData =
        Error.isError(error) && error.cause === 'NO_AUDIO_DATA';
      if (!(audioStarted || isProhibitedContent || isNoAudioData)) {
        captureException(error, {
          extra: { model: modelUsed, stream: true, voice: voiceObj.name },
          user: { id: user.id },
        });
      }

      await enqueue('error', { error: clientMessage });
    } finally {
      if (!completed) {
        await refundReservedCredits({
          amount: reservedCredits,
          context: 'generate_voice_stream_failure',
          userId: user.id,
        });
      }

      try {
        await writer.close();
      } catch {
        // Writer already closed via an early-return path — safe to ignore.
      }
    }
  })().catch((error) => {
    logger.error('Gemini stream task failed', {
      extra: {
        errorMessage: Error.isError(error) ? error.message : String(error),
        model: selectedModel,
        stream: true,
      },
      user: { email: user.email, id: user.id },
    });
    captureException(error, {
      extra: { model: selectedModel, stream: true, voice: voiceObj.name },
      user: { id: user.id },
    });
  });

  return new Response(readable, { headers: SSE_HEADERS });
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
