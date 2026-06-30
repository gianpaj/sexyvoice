import {
  FinishReason,
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
  GEMINI_TTS_31,
  resolveGeminiTtsModel,
} from '@/lib/tts/gemini-prompt';
import { generateXaiTts } from '@/lib/tts/xai';
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
    await restoreCredits({ userId, amount });
  } catch (refundError) {
    logger.error('Failed to restore reserved credits', {
      user: { id: userId },
      extra: {
        amount,
        context,
        errorMessage:
          refundError instanceof Error
            ? refundError.message
            : String(refundError),
      },
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
      await restoreCredits({ userId, amount: refundAmount });
      return actualCredits;
    } catch (refundError) {
      logger.error('Failed to refund unused reserved credits', {
        user: { id: userId },
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
      userId,
      amount: additionalCredits,
    });
    const totalCreditsDebited = reservedCredits + additionalCreditsDebited;

    if (additionalCreditsDebited < additionalCredits) {
      logger.warn('Partially debited additional reserved credits', {
        user: { id: userId },
        extra: {
          actualCredits,
          additionalCredits,
          additionalCreditsDebited,
          context,
          reservedCredits,
          totalCreditsDebited,
        },
      });
    }

    return totalCreditsDebited;
  } catch (debitError) {
    logger.error('Failed to debit additional reserved credits', {
      user: { id: userId },
      extra: {
        actualCredits,
        additionalCredits,
        context,
        errorMessage:
          debitError instanceof Error ? debitError.message : String(debitError),
        reservedCredits,
      },
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
    const stream = body.stream === true;

    if (Number.isSafeInteger(body.seed) && body.seed >= 0) {
      seed = body.seed;
    }

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
      id: user.id,
      email: user.email,
    });

    const voiceObj = await getVoiceById(voiceId);

    if (!voiceObj) {
      const error = new Error('Voice not found');
      captureException(error, { extra: { voiceId, text } });
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
        user: { id: user.id },
        extra: { voice: voiceObj.name, model: voiceObj.model },
      });
      return APIErrorResponse(
        'Streaming is temporarily disabled. Please refresh the page and try again.',
        409,
      );
    }

    userHasPaid = await hasUserPaid(user.id);

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
          estimatedTokens,
          combinedTokenLimit,
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
          textLength: text.length,
          maxLength,
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
        text,
        styleVariant,
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
        user: { id: user.id, email: user.email },
        extra: {
          voiceName: voiceObj.name,
          textLength: text.length,
          estimate,
          currentCreditsAmount: currentAmount,
        },
      });
      return APIErrorResponse('Insufficient credits', 402);
    }

    // Resolve the effective model before hashing so paid/free, 2.5/3.1, and
    // seeded requests never share a cache entry.
    const effectiveModel = isGeminiVoice
      ? resolveGeminiTtsModel({ model: voiceObj.model, userHasPaid })
      : voiceObj.model;

    const hashInput =
      seed === undefined
        ? `${text}-${voiceObj.name}-${effectiveModel}`
        : `${text}-${voiceObj.name}-${effectiveModel}-${seed}`;
    const hash = await generateHash(hashInput);

    const abortController = new AbortController();

    let folder = 'generated-audio-free';

    if (userHasPaid) {
      folder = 'generated-audio';
    }
    const path = `${folder}/${voiceObj.name}-${hash}`;

    request.signal.addEventListener('abort', () => {
      logger.info('Request aborted by client', {
        user: {
          id: user?.id,
        },
        extra: {
          hash,
          voiceName: voiceObj.name,
          text,
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
        filename,
        url: result,
        creditsUsed: 0,
        stream: shouldStream,
      });
      await sendPosthogEvent({
        userId: user.id,
        text,
        voiceId: voiceObj.id,
        creditUsed: 0,
        model: effectiveModel,
      });

      if (shouldStream) {
        const body = createSseEvent('done', {
          url: result,
          creditsUsed: 0,
          creditsRemaining: currentAmount,
          cached: true,
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

    await reduceCredits({ userId: user.id, amount: estimate });
    reservedCredits = estimate;

    if (isGeminiVoice) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const geminiTTSConfig = buildGeminiTtsConfig({
        voiceName: voiceObj.name,
        seed,
        abortSignal: abortController.signal,
      });

      if (shouldStream) {
        return streamGeminiTtsResponse({
          ai,
          text,
          config: geminiTTSConfig,
          voiceObj,
          user,
          userHasPaid,
          filename,
          estimate,
          currentAmount,
          styleVariant,
          provider,
          requestSignal: request.signal,
          reservedCredits: estimate,
        });
      }

      if (userHasPaid) {
        try {
          modelUsed = resolveGeminiTtsModel({
            model: voiceObj.model,
            userHasPaid,
          });

          genAIResponse = await ai.models.generateContent({
            model: modelUsed,
            contents: [{ role: 'user', parts: [{ text }] }],
            config: geminiTTSConfig,
          });
        } catch (error) {
          console.warn(error);
          if (error instanceof Error && error.name === 'AbortError') {
            console.info('Gemini voice generation aborted');
            await refundReservedCredits({
              userId: user.id,
              amount: reservedCredits,
              context: 'gemini_generate_abort',
            });
            reservedCredits = 0;
            return APIErrorResponse('Request aborted', 499);
          }

          const proErrorMessage =
            error instanceof Error ? error.message : String(error);
          const geminiRequestContext = {
            voice: voiceObj.name,
            styleVariant,
            provider,
            textLength: text.length,
            textPreview: text.slice(0, 500),
            requestedOutputCodec: outputCodec || null,
            responseModalities: geminiTTSConfig.responseModalities,
            speechConfig: geminiTTSConfig.speechConfig,
          };

          logger.warn(
            `${modelUsed} failed, retrying with gemini-2.5-flash-preview-tts`,
            {
              user: {
                id: user.id,
                email: user.email,
              },
              extra: {
                ...geminiRequestContext,
                model: modelUsed,
                errorMessage: proErrorMessage,
                errorCause: error instanceof Error ? error.cause : undefined,
              },
            },
          );
          modelUsed = 'gemini-2.5-flash-preview-tts'; // inputTokenLimit = 8192, outputTokenLimit = 16384
          try {
            genAIResponse = await ai.models.generateContent({
              model: modelUsed,
              contents: [{ role: 'user', parts: [{ text }] }],
              config: geminiTTSConfig,
            });

            logger.info('Gemini flash fallback succeeded after pro failure', {
              user: {
                id: user.id,
                email: user.email,
              },
              extra: {
                ...geminiRequestContext,
                originalModel: resolveGeminiTtsModel({
                  model: voiceObj.model,
                  userHasPaid,
                }),
                fallbackModel: modelUsed,
                proErrorMessage,
              },
            });
          } catch (flashError) {
            logger.error('Gemini flash fallback failed after pro failure', {
              user: {
                id: user.id,
                email: user.email,
              },
              extra: {
                ...geminiRequestContext,
                originalModel: resolveGeminiTtsModel({
                  model: voiceObj.model,
                  userHasPaid,
                }),
                fallbackModel: modelUsed,
                proErrorMessage,
                flashErrorMessage:
                  flashError instanceof Error
                    ? flashError.message
                    : String(flashError),
                flashErrorCause:
                  flashError instanceof Error ? flashError.cause : undefined,
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
          model: modelUsed,
          contents: [{ role: 'user', parts: [{ text }] }],
          config: geminiTTSConfig,
        });
      }
      const { data, mimeType } = extractInlineAudio(genAIResponse);
      const finishReason = genAIResponse?.candidates?.[0]?.finishReason;
      const blockReason = genAIResponse?.promptFeedback?.blockReason;
      const isProhibitedContent =
        finishReason === FinishReason.PROHIBITED_CONTENT ||
        blockReason === 'PROHIBITED_CONTENT';
      // Finished normally but no audio came back — transient provider glitch
      // rather than a content block, so surface it as retryable.
      const isNoAudioData =
        finishReason === FinishReason.STOP && !(data && mimeType);

      if (finishReason !== FinishReason.STOP || !data || !mimeType) {
        if (isProhibitedContent) {
          logger.warn('Content generation prohibited by Gemini', {
            user: { id: user.id, email: user.email },
            extra: {
              voice: voiceObj.name,
              styleVariant,
              model: modelUsed,
              provider,
              textLength: text.length,
              textPreview: text.slice(0, 500),
              responseId: genAIResponse?.responseId,
              blockReason,
              finishReason,
            },
          });
        } else if (isNoAudioData) {
          logger.warn('Gemini voice generation returned no audio data', {
            user: { id: user.id, email: user.email },
            extra: {
              voice: voiceName,
              styleVariant,
              model: modelUsed,
              provider,
              textLength: text.length,
              textPreview: text.slice(0, 500),
              responseId: genAIResponse?.responseId,
              finishReason,
              blockReason,
            },
          });
        } else {
          logger.error('Gemini voice generation failed', {
            user: { id: user.id, email: user.email },
            extra: {
              voice: voiceObj.name,
              styleVariant,
              model: modelUsed,
              provider,
              textLength: text.length,
              textPreview: text.slice(0, 500),
              responseId: genAIResponse?.responseId,
              error: finishReason,
              finishReason,
              blockReason,
              hasData: !!data,
              mimeType,
              response: genAIResponse,
            },
          });
          if (process.env.NODE_ENV === 'development') {
            console.dir(
              {
                error: finishReason,
                blockReason,
                hasData: !!data,
                mimeType,
                response: genAIResponse,
                model: modelUsed,
              },
              { depth: null },
            );
          }
        }
        // Only capture unexpected Gemini blocks to Sentry. PROHIBITED_CONTENT
        // and no-audio STOP responses are handled user/provider states.
        if (!(isProhibitedContent || isNoAudioData)) {
          captureException(new Error('Gemini 200 — no audio data'), {
            extra: {
              finishReason,
              blockReason,
              hasData: !!data,
              mimeType,
              isNoAudioData,
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
        user: {
          id: user.id,
          email: user.email,
        },
        extra: {
          voice: voiceObj.name,
          styleVariant,
          model: modelUsed,
          provider,
          responseId: genAIResponse!.responseId,
          textLength: text.length,
          textPreview: text.slice(0, 500),
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
          text,
          voiceId: voiceObj.name,
          language: selectedLanguage || voiceObj.language,
          codec: outputCodec,
          signal: abortController.signal,
        });
        selectedGrokCodec = codec;
        generatedAudioBuffer = audioBuffer;
        generatedAudioMimeType = contentType;
        uploadUrl = await uploadFileToR2(filename, audioBuffer, contentType);
      } catch (error) {
        const errorObj = {
          text,
          voice: voiceObj.name,
          model: voiceObj.model,
          codec: outputCodec,
          language: selectedLanguage || voiceObj.language,
          errorData: error,
        };
        logger.error('Grok TTS generation failed', {
          user: {
            id: user.id,
            email: user.email,
          },
          extra: {
            voice: voiceObj.name,
            text,
            model: voiceObj.model,
            codec: outputCodec,
            language: selectedLanguage || voiceObj.language,
            errorMessage: Error.isError(error) ? error.message : String(error),
            errorCause: Error.isError(error) ? error.cause : undefined,
          },
        });
        captureException(error, {
          extra: errorObj,
          user: { id: user.id, email: user.email },
        });
        console.error('Grok TTS generation failed', errorObj);
        throw new Error(getErrorMessage('XAI_TTS_ERROR', 'voice-generation'), {
          cause: 'XAI_TTS_ERROR',
        });
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
          text,
          voice: voiceObj.name,
          model: voiceObj.model,
          errorData: output.error,
        };
        const error = new Error('Voice generation failed', {
          cause: 'REPLICATE_ERROR',
        });
        captureException(error, {
          extra: errorObj,
          user: { id: user.id, email: user.email },
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
      userId: user.id,
      reservedCredits,
      actualCredits: creditsUsed,
      context: 'generate_voice_success',
    });
    reservedCredits = 0;

    let dollarAmount: number | undefined;
    if (isGrokVoice) {
      dollarAmount = calculateGenerateApiDollarAmount({
        sourceType: 'tts',
        provider: 'xai',
        model: modelUsed,
        inputChars: text.length,
      });
    } else if (isGeminiVoice && usage && 'promptTokenCount' in usage) {
      dollarAmount = calculateGenerateApiDollarAmount({
        sourceType: 'tts',
        provider: 'google',
        model: modelUsed,
        inputChars: text.length,
        promptTokenCount: usage.promptTokenCount,
        candidatesTokenCount: usage.candidatesTokenCount,
      });
    }

    after(async () => {
      if (!user) {
        captureException(new Error('User not found'));
        return;
      }

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: uploadUrl,
        model: modelUsed,
        predictionId: replicateResponse?.id,
        isPublic: false,
        voiceId: voiceObj.id,
        duration: await resolveDurationString(
          generatedAudioBuffer,
          generatedAudioMimeType,
        ),
        credits_used: creditsDebited,
        usage: {
          ...usage,
          userHasPaid,
        },
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          voice: voiceObj.name,
          model: modelUsed,
          errorData: audioFileDBResult.error,
        };
        const error = new Error('Failed to insert audio file row');
        captureException(error, {
          extra: errorObj,
        });
        console.error(errorObj);
      }

      // Insert usage event for tracking (non-blocking)
      await insertUsageEvent({
        userId: user.id,
        sourceType: 'tts',
        sourceId: audioFileDBResult.data?.id,
        unit: 'chars',
        quantity: text.length,
        creditsUsed: creditsDebited,
        ...(dollarAmount === undefined ? {} : { dollarAmount }),
        metadata: {
          voiceId: voiceObj.id,
          voiceName: voiceObj.name,
          model: modelUsed,
          provider,
          textPreview: text.slice(0, 100),
          textLength: text.length,
          isGeminiVoice,
          userHasPaid,
          predictionId: replicateResponse?.id ?? null,
          ...(isGrokVoice ? { codec: selectedGrokCodec } : {}),
        },
      });

      await sendPosthogEvent({
        userId: user.id,
        predictionId: replicateResponse?.id,
        text,
        voiceId: voiceObj.id,
        creditUsed: creditsDebited,
        model: modelUsed,
      });
    });

    return NextResponse.json(
      {
        url: uploadUrl,
        creditsUsed: creditsDebited,
        creditsRemaining: (currentAmount || 0) - creditsDebited,
      },
      { status: 200 },
    );
  } catch (error) {
    if (reservedCredits > 0 && user) {
      await refundReservedCredits({
        userId: user.id,
        amount: reservedCredits,
        context: 'generate_voice_failure',
      });
      reservedCredits = 0;
    }

    if (isInsufficientCreditsError(error)) {
      logger.info('Insufficient credits during reservation', {
        user: user ? { id: user.id, email: user.email } : undefined,
        extra: { voiceName, textLength: text.length },
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
          user: user ? { id: user.id, email: user.email } : undefined,
          extra: {
            textLength: text.length,
            voice: voiceName,
            googleStatus,
            googleCode: googleApiError.code,
          },
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
          user: user ? { id: user.id, email: user.email } : undefined,
          extra: {
            textLength: text.length,
            voice: voiceName,
            googleStatus,
            googleCode: googleApiError.code,
          },
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
          user: user ? { id: user.id, email: user.email } : undefined,
          extra: {
            textLength: text.length,
            voice: voiceName,
            googleStatus,
            googleCode: googleApiError.code,
          },
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
      text,
      voice: voiceName,
      errorData: error,
    };
    captureException(error, {
      extra: errorObj,
      user: user ? { id: user.id, email: user.email } : undefined,
    });
    console.error(errorObj);
    console.error('Voice generation error:', error);

    if (
      Error.isError(error) &&
      Object.keys(ERROR_CODES).includes(String(error.cause))
    ) {
      return APIErrorResponse(
        error.message || 'Voice generation failed, please retry',
        getErrorStatusCode(error.cause),
      );
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
      let errorCode: keyof typeof ERROR_CODES | undefined;
      if (
        streamFinishReason === FinishReason.PROHIBITED_CONTENT ||
        streamBlockReason === 'PROHIBITED_CONTENT'
      ) {
        errorCode = 'PROHIBITED_CONTENT';
      } else if (
        (streamFinishReason && streamFinishReason !== FinishReason.STOP) ||
        streamBlockReason
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
        model,
        contents: [{ parts: [{ text }] }],
        config,
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
        user: { id: user.id, email: user.email },
        extra: { model: selectedModel, textLength: text.length, stream: true },
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
            user: { id: user.id, email: user.email },
            extra: {
              originalModel: selectedModel,
              errorMessage: proErrorMessage,
              stream: true,
              voice: voiceObj.name,
            },
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
          user: { id: user.id, email: user.email },
          extra: { model: modelUsed, textLength: text.length, stream: true },
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
        user: { id: user.id, email: user.email },
        extra: { model: modelUsed, chunks: audioChunks.length, stream: true },
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
        userId: user.id,
        reservedCredits,
        actualCredits: creditsUsed,
        context: 'generate_voice_stream_success',
      });
      // Reconcile has settled the balance — clear the reservation so a later
      // failure (e.g. posthog flush) doesn't trigger a double-refund in the
      // `finally` block. Mirrors the non-stream path (reservedCredits = 0).
      reservedCredits = 0;

      const streamUsage: Record<string, string | number | boolean> =
        streamUsageMetadata
          ? {
              promptTokenCount: String(
                streamUsageMetadata.promptTokenCount ?? '',
              ),
              candidatesTokenCount: String(
                streamUsageMetadata.candidatesTokenCount ?? '',
              ),
              totalTokenCount: String(
                streamUsageMetadata.totalTokenCount ?? '',
              ),
              userHasPaid,
              stream: true,
            }
          : { userHasPaid, stream: true };

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: uploadUrl,
        model: modelUsed,
        predictionId: undefined,
        isPublic: false,
        voiceId: voiceObj.id,
        duration,
        credits_used: creditsDebited,
        usage: streamUsage,
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
        userId: user.id,
        sourceType: 'tts',
        sourceId: audioFileDBResult.data?.id,
        unit: 'chars',
        quantity: text.length,
        creditsUsed: creditsDebited,
        metadata: {
          voiceId: voiceObj.id,
          voiceName: voiceObj.name,
          model: modelUsed,
          provider,
          textPreview: text.slice(0, 100),
          textLength: text.length,
          isGeminiVoice: true,
          userHasPaid,
          predictionId: null,
          stream: true,
        },
      });

      await sendPosthogEvent({
        userId: user.id,
        text,
        voiceId: voiceObj.id,
        creditUsed: creditsDebited,
        model: modelUsed,
      });

      logger.info('Gemini stream done', {
        user: { id: user.id, email: user.email },
        extra: { model: modelUsed, creditsUsed: creditsDebited, stream: true },
      });

      completed = true;
      await enqueue('done', {
        url: uploadUrl,
        creditsUsed: creditsDebited,
        creditsRemaining: (currentAmount || 0) - creditsDebited,
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
        user: { id: user.id, email: user.email },
        extra: {
          model: modelUsed,
          audioStarted,
          errorMessage: rawMessage,
          stream: true,
          voice: voiceObj.name,
          styleVariant,
          textLength: text.length,
        },
      });

      const isProhibitedContent =
        Error.isError(error) && error.cause === 'PROHIBITED_CONTENT';
      if (!audioStarted && !isProhibitedContent) {
        captureException(error, {
          extra: { model: modelUsed, voice: voiceObj.name, stream: true },
          user: { id: user.id },
        });
      }

      await enqueue('error', { error: clientMessage });
    } finally {
      if (!completed) {
        await refundReservedCredits({
          userId: user.id,
          amount: reservedCredits,
          context: 'generate_voice_stream_failure',
        });
      }

      try {
        await writer.close();
      } catch {
        // Writer already closed via an early-return path — safe to ignore.
      }
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}

async function sendPosthogEvent({
  userId,
  text,
  voiceId,
  predictionId,
  creditUsed,
  model,
}: {
  userId: string;
  text: string;
  voiceId: string;
  predictionId?: string;
  creditUsed: number;
  model: string;
}) {
  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'generate-voice',
    properties: {
      // duration,
      predictionId,
      model,
      text,
      voiceId,
      credits_used: creditUsed,
      textLength: text.length,
    },
  });
  await posthog.shutdown();
}
