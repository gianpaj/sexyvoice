import {
  FinishReason,
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';
import { captureException } from '@sentry/nextjs';
import Replicate, { type Prediction } from 'replicate';

import { extractInlineAudio, getCharactersLimit } from '@/lib/ai';
import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import { createApiError, zodErrorToApiError } from '@/lib/api/errors';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { createLogger } from '@/lib/api/logger';
import {
  getDefaultFormat,
  isFormatSupported,
  isModelCompatibleWithVoice,
  resolveExternalModelId,
} from '@/lib/api/model';
import { calculateGenerateApiDollarAmount } from '@/lib/api/pricing';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { VoiceGenerationRequestSchema } from '@/lib/api/schemas';
import {
  convertToWav,
  formatDurationSeconds,
  getAudioDuration,
} from '@/lib/audio';
import { uploadFileToR2 } from '@/lib/storage/upload';
import {
  getCreditsAdmin,
  getVoiceByIdAdmin,
  getVoiceIdByNameAdmin,
  hasUserPaidAdmin,
  insertUsageEvent,
  isInsufficientCreditsError,
  reduceCreditsAdmin,
  reduceCreditsUpToAdmin,
  restoreCredits,
  saveAudioFileAdmin,
} from '@/lib/supabase/queries';
import { buildGeminiTtsPrompt } from '@/lib/tts/gemini-prompt';
import { generateXaiTts, normalizeXaiTtsCodec } from '@/lib/tts/xai';
import {
  calculateCreditsFromTokens,
  ERROR_CODES,
  estimateCredits,
  extractMetadata,
  getErrorMessage,
  getTtsProvider,
} from '@/lib/utils';
import {
  getGoogleApiErrorStatus,
  isGoogleQuotaError,
  isGoogleTransientProviderError,
} from '@/utils/google-rpc-status';
import { parseGoogleApiError } from '@/utils/googleErrors';

const ENDPOINT = '/api/v1/speech';

interface GeminiProviderFailure {
  code: string;
  googleCode?: number;
  googleStatus?: string;
  message: string;
  status: number;
  type: 'rate_limit_error' | 'server_error';
}

function getGeminiProviderFailure(
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

function resolveProviderName({
  isGeminiVoice,
  isGrokVoice,
}: {
  isGeminiVoice: boolean;
  isGrokVoice: boolean;
}): 'google' | 'replicate' | 'xai' {
  if (isGeminiVoice) {
    return 'google';
  }

  if (isGrokVoice) {
    return 'xai';
  }

  return 'replicate';
}

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 800; // seconds - fluid compute is enabled

export async function POST(request: Request) {
  const requestId = getExternalApiRequestId();
  const log = createLogger({ endpoint: ENDPOINT, requestId });

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    await log({ errorCode: 'missing_authorization_header', status: 401 });
    return externalApiErrorResponse({
      key: 'missing_authorization_header',
      requestId,
    });
  }

  const authResult = await validateApiKey(authHeader);
  if (!authResult) {
    await log({ errorCode: 'invalid_api_key', status: 401 });
    return externalApiErrorResponse({
      key: 'invalid_api_key',
      requestId,
    });
  }

  const rateLimit = await consumeRateLimit(authResult.keyHash);
  if (!rateLimit.allowed) {
    await log({
      apiKeyId: authResult.apiKeyId,
      errorCode: 'rate_limit_exceeded',
      status: 429,
      userId: authResult.userId,
    });
    return externalApiErrorResponse({
      key: 'rate_limit_exceeded',
      rateLimit,
      requestId,
    });
  }

  const respond = (
    body: unknown,
    init: ResponseInit = {},
    rateLimitState = rateLimit,
  ) => jsonWithRateLimitHeaders(body, init, rateLimitState, requestId);
  let reservedCredits = 0;
  const refundReservedCredits = async (context: string) => {
    if (reservedCredits <= 0) {
      return;
    }

    const creditsToRestore = reservedCredits;
    reservedCredits = 0;

    try {
      await restoreCredits({
        amount: creditsToRestore,
        userId: authResult.userId,
      });
    } catch (refundError) {
      captureException(refundError, {
        extra: {
          amount: creditsToRestore,
          apiKeyId: authResult.apiKeyId,
          context,
          endpoint: ENDPOINT,
          requestId,
          userId: authResult.userId,
        },
      });
      await log({
        apiKeyId: authResult.apiKeyId,
        error:
          refundError instanceof Error
            ? refundError.message
            : String(refundError),
        errorCode: 'credit_refund_failed',
        status: 500,
        userId: authResult.userId,
      });
    }
  };
  const reconcileReservedCredits = async ({
    actualCredits,
    context,
  }: {
    actualCredits: number;
    context: string;
  }): Promise<number> => {
    if (actualCredits === reservedCredits) {
      return reservedCredits;
    }

    if (actualCredits < reservedCredits) {
      const refundAmount = reservedCredits - actualCredits;
      try {
        await restoreCredits({
          amount: refundAmount,
          userId: authResult.userId,
        });
        return actualCredits;
      } catch (refundError) {
        captureException(refundError, {
          extra: {
            actualCredits,
            amount: refundAmount,
            apiKeyId: authResult.apiKeyId,
            context,
            endpoint: ENDPOINT,
            requestId,
            reservedCredits,
            userId: authResult.userId,
          },
        });
        await log({
          apiKeyId: authResult.apiKeyId,
          error:
            refundError instanceof Error
              ? refundError.message
              : String(refundError),
          errorCode: 'credit_refund_failed',
          status: 500,
          userId: authResult.userId,
        });
        return reservedCredits;
      }
    }

    const additionalCredits = actualCredits - reservedCredits;
    try {
      const additionalCreditsDebited = await reduceCreditsUpToAdmin({
        amount: additionalCredits,
        userId: authResult.userId,
      });
      const totalCreditsDebited = reservedCredits + additionalCreditsDebited;

      if (additionalCreditsDebited < additionalCredits) {
        await log({
          apiKeyId: authResult.apiKeyId,
          creditsUsed: totalCreditsDebited,
          errorCode: 'credit_partial_debit',
          status: 200,
          userId: authResult.userId,
        });
      }

      return totalCreditsDebited;
    } catch (debitError) {
      captureException(debitError, {
        extra: {
          actualCredits,
          amount: additionalCredits,
          apiKeyId: authResult.apiKeyId,
          context,
          endpoint: ENDPOINT,
          requestId,
          reservedCredits,
          userId: authResult.userId,
        },
      });
      await log({
        apiKeyId: authResult.apiKeyId,
        error:
          debitError instanceof Error ? debitError.message : String(debitError),
        errorCode: 'credit_debit_failed',
        status: 500,
        userId: authResult.userId,
      });
      return reservedCredits;
    }
  };

  // Fail fast on misconfiguration before performing any I/O (credit checks,
  // voice lookups, generation). The internal env-var name is intentionally
  // omitted from the response body to avoid leaking implementation details.
  const speechApiBucket = process.env.R2_SPEECH_API_BUCKET_NAME;
  if (!speechApiBucket) {
    await log({ errorCode: 'missing_r2_bucket_config', status: 500 });
    return respond(
      createApiError({
        code: 'server_error',
        message: 'Storage is not configured. Please contact support.',
        type: 'server_error',
      }),
      { status: 500 },
    );
  }

  try {
    const payload = await request.json();

    const parsed = VoiceGenerationRequestSchema.safeParse(payload);
    if (!parsed.success) {
      await log({
        apiKeyId: authResult.apiKeyId,
        error: parsed.error.message,
        errorCode: 'validation_error',
        status: 400,
        userId: authResult.userId,
      });
      return respond(zodErrorToApiError(parsed.error), { status: 400 });
    }

    const { input, response_format, style, seed, temperature, speed } =
      parsed.data;
    const requestedVoice = parsed.data.voice;
    const requestedVoiceId = parsed.data.voiceId;
    let model = parsed.data.model;

    const userId = authResult.userId;

    let voiceObj: Awaited<ReturnType<typeof getVoiceIdByNameAdmin>> | null =
      null;
    if (requestedVoiceId) {
      try {
        voiceObj = await getVoiceByIdAdmin(requestedVoiceId);
      } catch {
        voiceObj = null;
      }
    } else if (requestedVoice) {
      try {
        voiceObj = await getVoiceIdByNameAdmin(requestedVoice);
      } catch {
        voiceObj = null;
      }
    }

    if (!voiceObj) {
      await log({
        apiKeyId: authResult.apiKeyId,
        errorCode: 'voice_not_found',
        model,
        status: 404,
        userId,
        voice: requestedVoice,
        voiceId: requestedVoiceId,
      });
      return respond(
        createApiError({
          code: 'voice_not_found',
          message: requestedVoiceId
            ? `Voice ID "${requestedVoiceId}" was not found`
            : `Voice "${requestedVoice}" was not found`,
          param: requestedVoiceId ? 'voiceId' : 'voice',
          type: 'not_found_error',
        }),
        { status: 404 },
      );
    }

    const voice = voiceObj.name;
    if (requestedVoiceId) {
      model = resolveExternalModelId(voiceObj.model) ?? undefined;
    }

    if (!model) {
      await log({
        apiKeyId: authResult.apiKeyId,
        errorCode: 'voice_not_found',
        model: voiceObj.model,
        status: 404,
        userId,
        voice,
        voiceId: requestedVoiceId,
      });
      return respond(
        createApiError({
          code: 'voice_not_found',
          message: `Voice ID "${requestedVoiceId}" was not found`,
          param: 'voiceId',
          type: 'not_found_error',
        }),
        { status: 404 },
      );
    }

    const ttsProvider = getTtsProvider(voiceObj.model);
    const isGeminiVoice = ttsProvider === 'gemini';
    const isGrokVoice = ttsProvider === 'grok';
    const finalText =
      isGeminiVoice && style
        ? buildGeminiTtsPrompt({
            model: voiceObj.model,
            styleVariant: style,
            text: input,
          })
        : input;

    if (!isModelCompatibleWithVoice(model, voiceObj.model)) {
      await log({
        apiKeyId: authResult.apiKeyId,
        errorCode: 'model_not_found',
        model,
        status: 400,
        userId,
        voice,
      });
      return respond(
        createApiError({
          code: 'model_not_found',
          message: `Voice "${voice}" is not available for model "${model}"`,
          param: 'model',
          type: 'invalid_request_error',
        }),
        { status: 400 },
      );
    }

    const userHasPaid = await hasUserPaidAdmin(userId);
    const maxLength = getCharactersLimit(voiceObj.model, userHasPaid);
    if (finalText.length > maxLength) {
      const lengthErrorMessage =
        isGeminiVoice && style
          ? `The input text exceeds the maximum length of ${maxLength} characters after applying style`
          : `The input text exceeds the maximum length of ${maxLength} characters`;
      await log({
        apiKeyId: authResult.apiKeyId,
        errorCode: 'input_too_long',
        model,
        status: 400,
        textLength: finalText.length,
        userId,
        voice,
      });
      return respond(
        createApiError({
          code: 'input_too_long',
          message: lengthErrorMessage,
          param: 'input',
          type: 'invalid_request_error',
        }),
        { status: 400 },
      );
    }

    const defaultFormat = getDefaultFormat(model);
    const chosenFormat = response_format ?? defaultFormat;
    if (!isFormatSupported(model, chosenFormat)) {
      await log({
        apiKeyId: authResult.apiKeyId,
        errorCode: 'unsupported_response_format',
        model,
        status: 400,
        userId,
        voice,
      });
      return respond(
        createApiError({
          code: 'unsupported_response_format',
          message: `Model "${model}" does not support "${chosenFormat}" format`,
          param: 'response_format',
          type: 'invalid_request_error',
        }),
        { status: 400 },
      );
    }

    const currentCredits = await getCreditsAdmin(userId);
    const estimatedCredits = estimateCredits(finalText, voice, voiceObj.model);
    if (currentCredits < estimatedCredits) {
      await log({
        apiKeyId: authResult.apiKeyId,
        errorCode: 'insufficient_credits',
        model,
        status: 402,
        textLength: finalText.length,
        userId,
        voice,
      });
      return respond(
        createApiError({
          code: 'insufficient_credits',
          message: 'Insufficient credits',
          type: 'permission_error',
        }),
        { status: 402 },
      );
    }

    try {
      await reduceCreditsAdmin({ amount: estimatedCredits, userId });
      reservedCredits = estimatedCredits;
    } catch (error) {
      if (!isInsufficientCreditsError(error)) {
        throw error;
      }

      await log({
        apiKeyId: authResult.apiKeyId,
        errorCode: 'insufficient_credits',
        model,
        status: 402,
        textLength: finalText.length,
        userId,
        voice,
      });
      return respond(
        createApiError({
          code: 'insufficient_credits',
          message: 'Insufficient credits',
          type: 'permission_error',
        }),
        { status: 402 },
      );
    }

    const folder = userHasPaid ? 'generated-audio' : 'generated-audio-free';
    const extension = chosenFormat;
    const filename = `${folder}/${voice}-${Date.now()}.${extension}`;

    const provider = resolveProviderName({ isGeminiVoice, isGrokVoice });
    let modelUsed = voiceObj.model;
    let uploadUrl: string;
    let replicateResponse: Prediction | undefined;
    let geminiResponse: GenerateContentResponse | null = null;
    let generatedAudioBuffer: Buffer | undefined;
    let generatedAudioMimeType: string | undefined;

    if (isGeminiVoice) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      const config: GenerateContentConfig = {
        responseModalities: ['AUDIO'],
        ...(seed === undefined ? {} : { seed }),
        ...(temperature === undefined ? {} : { temperature }),
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice.charAt(0).toUpperCase() + voice.slice(1),
            },
          },
        },
      };

      try {
        modelUsed =
          model === 'gpro31'
            ? 'gemini-3.1-flash-tts-preview'
            : 'gemini-2.5-pro-preview-tts';
        geminiResponse = await ai.models.generateContent({
          config,
          contents: [{ parts: [{ text: finalText }], role: 'user' }],
          model: modelUsed,
        });
      } catch (proError) {
        modelUsed = 'gemini-2.5-flash-preview-tts';
        try {
          geminiResponse = await ai.models.generateContent({
            config,
            contents: [{ parts: [{ text: finalText }], role: 'user' }],
            model: modelUsed,
          });
        } catch (flashError) {
          const providerFailure = getGeminiProviderFailure(
            proError,
            flashError,
          );

          if (providerFailure) {
            await refundReservedCredits('gemini_provider_failure');
            await log({
              apiKeyId: authResult.apiKeyId,
              error: providerFailure.message,
              errorCode: providerFailure.code,
              isGeminiVoice,
              model: modelUsed,
              provider,
              providerCode: providerFailure.googleCode,
              providerStatus: providerFailure.googleStatus,
              status: providerFailure.status,
              textLength: finalText.length,
              userId,
              voice,
            });

            return respond(
              createApiError({
                code: providerFailure.code,
                message: providerFailure.message,
                type: providerFailure.type,
              }),
              { status: providerFailure.status },
            );
          }

          throw new Error(
            `Both Gemini models failed. Pro error: ${proError instanceof Error ? proError.message : String(proError)}. Flash error: ${flashError instanceof Error ? flashError.message : String(flashError)}`,
            { cause: flashError },
          );
        }
      }

      const { data, mimeType } = extractInlineAudio(geminiResponse);
      const finishReason = geminiResponse?.candidates?.[0]?.finishReason;
      const blockReason = geminiResponse?.promptFeedback?.blockReason;
      const isProhibitedContent =
        finishReason === FinishReason.PROHIBITED_CONTENT ||
        blockReason === 'PROHIBITED_CONTENT';
      // Finished normally but no audio came back — transient provider glitch
      // rather than a content block, so surface it as retryable.
      const isNoAudioData =
        finishReason === FinishReason.STOP && !(data && mimeType);

      if (finishReason !== FinishReason.STOP || !data || !mimeType) {
        const code = isProhibitedContent
          ? 'content_policy_violation'
          : 'server_error';
        let noAudioErrorCode: keyof typeof ERROR_CODES = 'OTHER_GEMINI_BLOCK';
        if (isProhibitedContent) {
          noAudioErrorCode = 'PROHIBITED_CONTENT';
        } else if (isNoAudioData) {
          noAudioErrorCode = 'NO_AUDIO_DATA';
        }
        const message = getErrorMessage(noAudioErrorCode, 'voice-generation');
        const httpStatus = isProhibitedContent ? 422 : 500;
        await refundReservedCredits('gemini_no_audio');
        await log({
          apiKeyId: authResult.apiKeyId,
          error: message,
          errorCode: code,
          isGeminiVoice,
          model: modelUsed,
          status: httpStatus,
          textLength: finalText.length,
          userId,
          voice,
        });
        return respond(
          createApiError({
            code,
            message,
            param: isProhibitedContent ? 'input' : null,
            type: isProhibitedContent
              ? 'invalid_request_error'
              : 'server_error',
          }),
          { status: httpStatus },
        );
      }

      const audioBuffer = convertToWav(data, mimeType);
      generatedAudioBuffer = audioBuffer;
      generatedAudioMimeType = 'audio/wav';
      uploadUrl = await uploadFileToR2(
        filename,
        audioBuffer,
        'audio/wav',
        speechApiBucket,
        process.env.R2_SPEECH_API_PUBLIC_URL,
      );
    } else if (isGrokVoice) {
      modelUsed = voiceObj.model;
      const codec = normalizeXaiTtsCodec(chosenFormat);

      try {
        const { audioBuffer, contentType } = await generateXaiTts({
          codec,
          language: voiceObj.language ?? 'en',
          speed,
          text: finalText,
          voiceId: voice,
        });
        generatedAudioBuffer = audioBuffer;
        generatedAudioMimeType = contentType;
        uploadUrl = await uploadFileToR2(
          filename,
          audioBuffer,
          contentType,
          speechApiBucket,
          process.env.R2_SPEECH_API_PUBLIC_URL,
        );
      } catch (error) {
        captureException(error, {
          extra: { codec, model: modelUsed, requestId, voice },
        });
        const message = getErrorMessage('XAI_TTS_ERROR', 'voice-generation');
        await refundReservedCredits('xai_tts_error');
        await log({
          apiKeyId: authResult.apiKeyId,
          error: message,
          errorCode: 'xai_tts_error',
          isGrokVoice,
          model: modelUsed,
          provider,
          status: 500,
          textLength: finalText.length,
          userId,
          voice,
        });
        return respond(
          createApiError({
            code: 'server_error',
            message,
            type: 'server_error',
          }),
          { status: 500 },
        );
      }
    } else {
      const replicate = new Replicate();
      const output = (await replicate.run(
        voiceObj.model as `${string}/${string}`,
        { input: { text: finalText, voice } },
        (prediction: Prediction) => {
          replicateResponse = prediction;
        },
      )) as ReadableStream | { error: string };

      if ('error' in output) {
        const message = getErrorMessage('REPLICATE_ERROR', 'voice-generation');
        await refundReservedCredits('replicate_error');
        await log({
          apiKeyId: authResult.apiKeyId,
          error: message,
          errorCode: 'replicate_error',
          isGeminiVoice,
          model: modelUsed,
          provider,
          status: 500,
          textLength: finalText.length,
          userId,
          voice,
        });
        return respond(
          createApiError({
            code: 'server_error',
            message,
            type: 'server_error',
          }),
          { status: 500 },
        );
      }

      const chunks: Uint8Array[] = [];
      const reader = output.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          chunks.push(value);
        }
      }
      const audioBuffer = Buffer.concat(chunks);
      generatedAudioBuffer = audioBuffer;
      generatedAudioMimeType = 'audio/mpeg';
      uploadUrl = await uploadFileToR2(
        filename,
        audioBuffer,
        'audio/mpeg',
        speechApiBucket,
        process.env.R2_SPEECH_API_PUBLIC_URL,
      );
    }

    if (!uploadUrl) {
      throw new Error('uploadUrl is empty after generation — this is a bug');
    }

    const durationSeconds =
      generatedAudioBuffer && generatedAudioMimeType
        ? await getAudioDuration(generatedAudioBuffer, generatedAudioMimeType)
        : null;

    let creditsUsed = estimatedCredits;
    const usageMetadata = extractMetadata(
      isGeminiVoice,
      geminiResponse,
      replicateResponse,
    );
    if (isGeminiVoice && usageMetadata?.totalTokenCount) {
      creditsUsed = calculateCreditsFromTokens(
        Number.parseInt(usageMetadata.totalTokenCount, 10),
      );
    }
    const creditsDebited = await reconcileReservedCredits({
      actualCredits: creditsUsed,
      context: 'speech_success',
    });
    reservedCredits = 0;

    const dollarAmount = calculateGenerateApiDollarAmount({
      candidatesTokenCount:
        isGeminiVoice &&
        usageMetadata &&
        'candidatesTokenCount' in usageMetadata
          ? usageMetadata.candidatesTokenCount
          : null,
      inputChars: finalText.length,
      model: modelUsed,
      promptTokenCount:
        isGeminiVoice && usageMetadata && 'promptTokenCount' in usageMetadata
          ? usageMetadata.promptTokenCount
          : null,
      provider,
      sourceType: 'api_tts',
    });
    const [audioFileResult, updatedCredits] = await Promise.all([
      saveAudioFileAdmin({
        credits_used: creditsDebited,
        duration: formatDurationSeconds(durationSeconds),
        filename,
        isPublic: false,
        model: modelUsed,
        predictionId: replicateResponse?.id,
        text: finalText,
        url: uploadUrl,
        usage: {
          ...usageMetadata,
          apiKeyId: authResult.apiKeyId,
          dollarAmount,
          sourceType: 'api_tts',
          userHasPaid,
          ...(seed === undefined ? {} : { seed }),
        },
        userId,
        voiceId: voiceObj.id,
      }),
      getCreditsAdmin(userId),
    ]);

    await insertUsageEvent({
      apiKeyId: authResult.apiKeyId,
      creditsUsed: creditsDebited,
      dollarAmount,
      durationSeconds,
      inputChars: finalText.length,
      metadata: {
        model: modelUsed,
        textLength: finalText.length,
        textPreview: finalText.slice(0, 100),
        voiceId: voiceObj.id,
        voiceName: voice,
        ...(seed === undefined ? {} : { seed }),
        isGeminiVoice,
        isGrokVoice,
        predictionId: replicateResponse?.id ?? null,
        userHasPaid,
      },
      model: modelUsed,
      quantity: finalText.length,
      requestId,
      sourceId: audioFileResult.data?.id ?? null,
      sourceType: 'api_tts',
      unit: 'chars',
      userId,
    });

    // Fire-and-forget: do not await the log call on the success path.
    // A flush failure must never return a 500 to the client after audio has
    // been generated and credits have already been deducted.
    log({
      apiKeyId: authResult.apiKeyId,
      creditsUsed: creditsDebited,
      dollarAmount,
      isGeminiVoice,
      isGrokVoice,
      model: modelUsed,
      provider,
      status: 200,
      textLength: finalText.length,
      userHasPaid,
      userId,
      voice,
    }).catch((err) => {
      console.error('[speech] success-path log failed:', err);
    });
    return respond(
      {
        credits_remaining: updatedCredits,
        credits_used: creditsDebited,
        url: uploadUrl,
        usage: {
          input_characters: finalText.length,
          model: modelUsed,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    await refundReservedCredits('speech_failure');

    if (
      Error.isError(error) &&
      error.cause &&
      Object.values(ERROR_CODES).includes(error.cause as never)
    ) {
      const isPolicy = error.cause === ERROR_CODES.PROHIBITED_CONTENT;
      const httpStatus = isPolicy ? 422 : 500;
      await log({
        apiKeyId: authResult.apiKeyId,
        error: error.message,
        errorCode: isPolicy ? 'content_policy_violation' : 'server_error',
        status: httpStatus,
        userId: authResult.userId,
      });
      return respond(
        createApiError({
          code: isPolicy ? 'content_policy_violation' : 'server_error',
          message: error.message,
          type: isPolicy ? 'invalid_request_error' : 'server_error',
        }),
        { status: httpStatus },
      );
    }

    if (error instanceof SyntaxError) {
      await log({
        apiKeyId: authResult.apiKeyId,
        error: error.message,
        errorCode: 'invalid_json',
        status: 400,
        userId: authResult.userId,
      });
      return externalApiErrorResponse({
        key: 'invalid_json',
        rateLimit,
        requestId,
      });
    }

    captureException(error, {
      extra: {
        apiKeyId: authResult.apiKeyId,
        endpoint: ENDPOINT,
        requestId,
        userId: authResult.userId,
      },
    });
    await log({
      apiKeyId: authResult.apiKeyId,
      error: error instanceof Error ? error.message : String(error),
      errorCode: 'server_error',
      status: 500,
      userId: authResult.userId,
    });
    return externalApiErrorResponse({
      key: 'server_error',
      rateLimit,
      requestId,
    });
  } finally {
    await updateApiKeyLastUsed(authResult.keyHash);
  }
}

export const runtime = 'nodejs';
