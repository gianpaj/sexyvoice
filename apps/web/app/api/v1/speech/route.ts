import { type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import { captureException } from '@sentry/nextjs';
import type { Prediction } from 'replicate';

import { getCharactersLimit } from '@/lib/ai';
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
  reduceCreditsAdmin,
  saveAudioFileAdmin,
} from '@/lib/supabase/queries';
import {
  buildGeminiTtsConfig,
  classifyGeminiAudio,
  GEMINI_FLASH_MODEL,
  GeminiGenerationError,
  generateGeminiAudio,
  getGeminiProviderFailure,
  selectGeminiModel,
} from '@/lib/tts/gemini';
import { buildStyledText } from '@/lib/tts/prompt';
import {
  generateReplicateAudio,
  ReplicateGenerationError,
} from '@/lib/tts/replicate';
import { generateXaiTts, normalizeXaiTtsCodec } from '@/lib/tts/xai';
import {
  calculateCreditsFromTokens,
  ERROR_CODES,
  estimateCredits,
  extractMetadata,
  getErrorMessage,
  getTtsProvider,
} from '@/lib/utils';

const ENDPOINT = '/api/v1/speech';

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Single entrypoint orchestrates validation, billing, generation and persistence.
export async function POST(request: Request) {
  const requestId = getExternalApiRequestId();
  const log = createLogger({ requestId, endpoint: ENDPOINT });

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    await log({ status: 401, errorCode: 'missing_authorization_header' });
    return externalApiErrorResponse({
      key: 'missing_authorization_header',
      requestId,
    });
  }

  const authResult = await validateApiKey(authHeader);
  if (!authResult) {
    await log({ status: 401, errorCode: 'invalid_api_key' });
    return externalApiErrorResponse({
      key: 'invalid_api_key',
      requestId,
    });
  }

  const rateLimit = await consumeRateLimit(authResult.keyHash);
  if (!rateLimit.allowed) {
    await log({
      status: 429,
      errorCode: 'rate_limit_exceeded',
      userId: authResult.userId,
      apiKeyId: authResult.apiKeyId,
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

  // Fail fast on misconfiguration before performing any I/O (credit checks,
  // voice lookups, generation). The internal env-var name is intentionally
  // omitted from the response body to avoid leaking implementation details.
  const speechApiBucket = process.env.R2_SPEECH_API_BUCKET_NAME;
  if (!speechApiBucket) {
    await log({ status: 500, errorCode: 'missing_r2_bucket_config' });
    return respond(
      createApiError({
        message: 'Storage is not configured. Please contact support.',
        type: 'server_error',
        code: 'server_error',
      }),
      { status: 500 },
    );
  }

  try {
    const payload = await request.json();

    const parsed = VoiceGenerationRequestSchema.safeParse(payload);
    if (!parsed.success) {
      await log({
        status: 400,
        errorCode: 'validation_error',
        error: parsed.error.message,
        userId: authResult.userId,
        apiKeyId: authResult.apiKeyId,
      });
      return respond(zodErrorToApiError(parsed.error), { status: 400 });
    }

    const { input, response_format, style, seed } = parsed.data;
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
        status: 404,
        errorCode: 'voice_not_found',
        userId,
        apiKeyId: authResult.apiKeyId,
        voice: requestedVoice,
        voiceId: requestedVoiceId,
        model,
      });
      return respond(
        createApiError({
          message: requestedVoiceId
            ? `Voice ID "${requestedVoiceId}" was not found`
            : `Voice "${requestedVoice}" was not found`,
          type: 'not_found_error',
          code: 'voice_not_found',
          param: requestedVoiceId ? 'voiceId' : 'voice',
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
        status: 404,
        errorCode: 'voice_not_found',
        userId,
        apiKeyId: authResult.apiKeyId,
        voice,
        voiceId: requestedVoiceId,
        model: voiceObj.model,
      });
      return respond(
        createApiError({
          message: `Voice ID "${requestedVoiceId}" was not found`,
          type: 'not_found_error',
          code: 'voice_not_found',
          param: 'voiceId',
        }),
        { status: 404 },
      );
    }

    const ttsProvider = getTtsProvider(voiceObj.model);
    const isGeminiVoice = ttsProvider === 'gemini';
    const isGrokVoice = ttsProvider === 'grok';
    const finalText = buildStyledText({
      dbModel: voiceObj.model,
      isGeminiVoice,
      style,
      text: input,
    });

    if (!isModelCompatibleWithVoice(model, voiceObj.model)) {
      await log({
        status: 400,
        errorCode: 'model_not_found',
        userId,
        apiKeyId: authResult.apiKeyId,
        voice,
        model,
      });
      return respond(
        createApiError({
          message: `Voice "${voice}" is not available for model "${model}"`,
          type: 'invalid_request_error',
          code: 'model_not_found',
          param: 'model',
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
        status: 400,
        errorCode: 'input_too_long',
        userId,
        apiKeyId: authResult.apiKeyId,
        voice,
        model,
        textLength: finalText.length,
      });
      return respond(
        createApiError({
          message: lengthErrorMessage,
          type: 'invalid_request_error',
          code: 'input_too_long',
          param: 'input',
        }),
        { status: 400 },
      );
    }

    const defaultFormat = getDefaultFormat(model);
    const chosenFormat = response_format ?? defaultFormat;
    if (!isFormatSupported(model, chosenFormat)) {
      await log({
        status: 400,
        errorCode: 'unsupported_response_format',
        userId,
        apiKeyId: authResult.apiKeyId,
        voice,
        model,
      });
      return respond(
        createApiError({
          message: `Model "${model}" does not support "${chosenFormat}" format`,
          type: 'invalid_request_error',
          code: 'unsupported_response_format',
          param: 'response_format',
        }),
        { status: 400 },
      );
    }

    const currentCredits = await getCreditsAdmin(userId);
    const estimatedCredits = estimateCredits(finalText, voice, voiceObj.model);
    if (currentCredits < estimatedCredits) {
      await log({
        status: 402,
        errorCode: 'insufficient_credits',
        userId,
        apiKeyId: authResult.apiKeyId,
        voice,
        model,
        textLength: finalText.length,
      });
      return respond(
        createApiError({
          message: 'Insufficient credits',
          type: 'permission_error',
          code: 'insufficient_credits',
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
      const config = buildGeminiTtsConfig({
        voiceName: voice,
        seed,
        abortSignal: request.signal,
      });

      // The external API always generates at the paid (pro/3.1) tier and
      // relies on the shared flash fallback in generateGeminiAudio.
      const primaryModel = selectGeminiModel({
        dbModel: voiceObj.model,
        userHasPaid: true,
      });

      try {
        const generation = await generateGeminiAudio({
          ai,
          primaryModel,
          text: finalText,
          config,
        });
        geminiResponse = generation.response;
        modelUsed = generation.modelUsed;
      } catch (error) {
        if (error instanceof GeminiGenerationError) {
          const providerFailure = getGeminiProviderFailure(
            error.proError,
            error.flashError,
          );

          if (providerFailure) {
            await log({
              status: providerFailure.status,
              errorCode: providerFailure.code,
              error: providerFailure.message,
              userId,
              apiKeyId: authResult.apiKeyId,
              voice,
              model: GEMINI_FLASH_MODEL,
              textLength: finalText.length,
              provider,
              providerCode: providerFailure.googleCode,
              providerStatus: providerFailure.googleStatus,
              isGeminiVoice,
            });

            return respond(
              createApiError({
                message: providerFailure.message,
                type: providerFailure.type,
                code: providerFailure.code,
              }),
              { status: providerFailure.status },
            );
          }
        }
        throw error;
      }

      const classification = classifyGeminiAudio(geminiResponse);

      if (classification.errorCode) {
        const isProhibitedContent =
          classification.errorCode === 'PROHIBITED_CONTENT';
        const code = isProhibitedContent
          ? 'content_policy_violation'
          : 'server_error';
        const message = getErrorMessage(
          classification.errorCode,
          'voice-generation',
        );
        const httpStatus = isProhibitedContent ? 422 : 500;
        await log({
          status: httpStatus,
          errorCode: code,
          error: message,
          userId,
          apiKeyId: authResult.apiKeyId,
          voice,
          model: modelUsed,
          textLength: finalText.length,
          isGeminiVoice,
        });
        return respond(
          createApiError({
            message,
            type: isProhibitedContent
              ? 'invalid_request_error'
              : 'server_error',
            code,
            param: isProhibitedContent ? 'input' : null,
          }),
          { status: httpStatus },
        );
      }

      // A null errorCode guarantees both data and mimeType are present.
      const audioBuffer = convertToWav(
        classification.data as string,
        classification.mimeType as string,
      );
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
          text: finalText,
          voiceId: voice,
          language: voiceObj.language ?? 'en',
          codec,
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
          extra: { requestId, voice, model: modelUsed, codec },
        });
        const message = getErrorMessage('XAI_TTS_ERROR', 'voice-generation');
        await log({
          status: 500,
          errorCode: 'xai_tts_error',
          error: message,
          userId,
          apiKeyId: authResult.apiKeyId,
          voice,
          model: modelUsed,
          textLength: finalText.length,
          provider,
          isGrokVoice,
        });
        return respond(
          createApiError({
            message,
            type: 'server_error',
            code: 'server_error',
          }),
          { status: 500 },
        );
      }
    } else {
      try {
        const { buffer } = await generateReplicateAudio({
          model: voiceObj.model,
          text: finalText,
          voice,
          onProgress: (prediction) => {
            replicateResponse = prediction;
          },
        });
        generatedAudioBuffer = buffer;
        generatedAudioMimeType = 'audio/mpeg';
        uploadUrl = await uploadFileToR2(
          filename,
          buffer,
          'audio/mpeg',
          speechApiBucket,
          process.env.R2_SPEECH_API_PUBLIC_URL,
        );
      } catch (error) {
        if (error instanceof ReplicateGenerationError) {
          const message = getErrorMessage(
            'REPLICATE_ERROR',
            'voice-generation',
          );
          await log({
            status: 500,
            errorCode: 'replicate_error',
            error: message,
            userId,
            apiKeyId: authResult.apiKeyId,
            voice,
            model: modelUsed,
            textLength: finalText.length,
            provider,
            isGeminiVoice,
          });
          return respond(
            createApiError({
              message,
              type: 'server_error',
              code: 'server_error',
            }),
            { status: 500 },
          );
        }
        throw error;
      }
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

    await reduceCreditsAdmin({ userId, amount: creditsUsed });
    const dollarAmount = calculateGenerateApiDollarAmount({
      sourceType: 'api_tts',
      provider,
      model: modelUsed,
      inputChars: finalText.length,
      promptTokenCount:
        isGeminiVoice && usageMetadata && 'promptTokenCount' in usageMetadata
          ? usageMetadata.promptTokenCount
          : null,
      candidatesTokenCount:
        isGeminiVoice &&
        usageMetadata &&
        'candidatesTokenCount' in usageMetadata
          ? usageMetadata.candidatesTokenCount
          : null,
    });
    const [audioFileResult, updatedCredits] = await Promise.all([
      saveAudioFileAdmin({
        userId,
        filename,
        text: finalText,
        url: uploadUrl,
        model: modelUsed,
        predictionId: replicateResponse?.id,
        isPublic: false,
        voiceId: voiceObj.id,
        duration: formatDurationSeconds(durationSeconds),
        credits_used: creditsUsed,
        usage: {
          ...usageMetadata,
          userHasPaid,
          apiKeyId: authResult.apiKeyId,
          sourceType: 'api_tts',
          dollarAmount,
          ...(seed === undefined ? {} : { seed }),
        },
      }),
      getCreditsAdmin(userId),
    ]);

    await insertUsageEvent({
      userId,
      sourceType: 'api_tts',
      sourceId: audioFileResult.data?.id ?? null,
      apiKeyId: authResult.apiKeyId,
      model: modelUsed,
      inputChars: finalText.length,
      durationSeconds,
      dollarAmount,
      unit: 'chars',
      quantity: finalText.length,
      creditsUsed,
      requestId,
      metadata: {
        voiceId: voiceObj.id,
        voiceName: voice,
        model: modelUsed,
        textPreview: finalText.slice(0, 100),
        textLength: finalText.length,
        ...(seed === undefined ? {} : { seed }),
        isGeminiVoice,
        isGrokVoice,
        userHasPaid,
        predictionId: replicateResponse?.id ?? null,
      },
    });

    // Fire-and-forget: do not await the log call on the success path.
    // A flush failure must never return a 500 to the client after audio has
    // been generated and credits have already been deducted.
    log({
      status: 200,
      userId,
      apiKeyId: authResult.apiKeyId,
      voice,
      model: modelUsed,
      textLength: finalText.length,
      provider,
      creditsUsed,
      dollarAmount,
      isGeminiVoice,
      isGrokVoice,
      userHasPaid,
    }).catch((err) => {
      console.error('[speech] success-path log failed:', err);
    });
    return respond(
      {
        url: uploadUrl,
        credits_used: creditsUsed,
        credits_remaining: Math.max(0, updatedCredits - creditsUsed),
        usage: {
          input_characters: finalText.length,
          model: modelUsed,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (
      Error.isError(error) &&
      error.cause &&
      Object.values(ERROR_CODES).includes(error.cause as never)
    ) {
      const isPolicy = error.cause === ERROR_CODES.PROHIBITED_CONTENT;
      const httpStatus = isPolicy ? 422 : 500;
      await log({
        status: httpStatus,
        errorCode: isPolicy ? 'content_policy_violation' : 'server_error',
        error: error.message,
        userId: authResult.userId,
        apiKeyId: authResult.apiKeyId,
      });
      return respond(
        createApiError({
          message: error.message,
          type: isPolicy ? 'invalid_request_error' : 'server_error',
          code: isPolicy ? 'content_policy_violation' : 'server_error',
        }),
        { status: httpStatus },
      );
    }

    if (error instanceof SyntaxError) {
      await log({
        status: 400,
        errorCode: 'invalid_json',
        error: error.message,
        userId: authResult.userId,
        apiKeyId: authResult.apiKeyId,
      });
      return externalApiErrorResponse({
        key: 'invalid_json',
        rateLimit,
        requestId,
      });
    }

    captureException(error, {
      extra: {
        requestId,
        endpoint: ENDPOINT,
        userId: authResult.userId,
        apiKeyId: authResult.apiKeyId,
      },
    });
    await log({
      status: 500,
      errorCode: 'server_error',
      error: error instanceof Error ? error.message : String(error),
      userId: authResult.userId,
      apiKeyId: authResult.apiKeyId,
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
