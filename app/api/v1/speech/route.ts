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

import { getCharactersLimit } from '@/lib/ai';
import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import { createApiError, zodErrorToApiError } from '@/lib/api/errors';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { createLogger } from '@/lib/api/logger';
import { getDefaultFormat, resolveExternalModelId } from '@/lib/api/model';
import { calculateExternalApiDollarAmount } from '@/lib/api/pricing';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { VoiceGenerationRequestSchema } from '@/lib/api/schemas';
import { convertToWav } from '@/lib/audio';
import { uploadFileToR2 } from '@/lib/storage/upload';
import {
  getCreditsAdmin,
  getVoiceIdByNameAdmin,
  hasUserPaidAdmin,
  insertUsageEvent,
  reduceCreditsAdmin,
  saveAudioFileAdmin,
} from '@/lib/supabase/queries';
import {
  calculateCreditsFromTokens,
  ERROR_CODES,
  estimateCredits,
  extractMetadata,
  getErrorMessage,
} from '@/lib/utils';

const ENDPOINT = '/api/v1/speech';

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

    const { model, input, voice, response_format, style, seed } = parsed.data;
    const finalText = style ? `${style}: ${input}` : input;

    const userId = authResult.userId;

    let voiceObj: Awaited<ReturnType<typeof getVoiceIdByNameAdmin>> | null =
      null;
    try {
      voiceObj = await getVoiceIdByNameAdmin(voice);
    } catch {
      voiceObj = null;
    }

    if (!voiceObj) {
      await log({
        status: 404,
        errorCode: 'voice_not_found',
        userId,
        apiKeyId: authResult.apiKeyId,
        voice,
        model,
      });
      return respond(
        createApiError({
          message: `Voice "${voice}" was not found`,
          type: 'not_found_error',
          code: 'voice_not_found',
          param: 'voice',
        }),
        { status: 404 },
      );
    }

    const resolvedModel = resolveExternalModelId(voiceObj.model);
    if (model !== resolvedModel) {
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
          message: `The input text exceeds the maximum length of ${maxLength} characters after applying style`,
          type: 'invalid_request_error',
          code: 'input_too_long',
          param: 'input',
        }),
        { status: 400 },
      );
    }

    const defaultFormat = getDefaultFormat(resolvedModel);
    if (response_format && response_format !== defaultFormat) {
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
          message: `Model "${model}" only supports "${defaultFormat}" output`,
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
    const extension = defaultFormat;
    const filename = `${folder}/${voice}-${Date.now()}.${extension}`;

    const isGeminiVoice = voiceObj.model === 'gpro';
    const provider = isGeminiVoice ? 'google' : 'replicate';
    let modelUsed = voiceObj.model;
    let uploadUrl: string;
    let replicateResponse: Prediction | undefined;
    let geminiResponse: GenerateContentResponse | null = null;

    if (isGeminiVoice) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      const config: GenerateContentConfig = {
        responseModalities: ['AUDIO'],
        ...(seed === undefined ? {} : { seed }),
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice.charAt(0).toUpperCase() + voice.slice(1),
            },
          },
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      };

      try {
        modelUsed = 'gemini-2.5-pro-preview-tts';
        geminiResponse = await ai.models.generateContent({
          model: modelUsed,
          contents: [{ parts: [{ text: finalText }] }],
          config,
        });
      } catch (proError) {
        modelUsed = 'gemini-2.5-flash-preview-tts';
        try {
          geminiResponse = await ai.models.generateContent({
            model: modelUsed,
            contents: [{ parts: [{ text: finalText }] }],
            config,
          });
        } catch (flashError) {
          throw new Error(
            `Both Gemini models failed. Pro error: ${proError instanceof Error ? proError.message : String(proError)}. Flash error: ${flashError instanceof Error ? flashError.message : String(flashError)}`,
          );
        }
      }

      const part = geminiResponse?.candidates?.[0]?.content?.parts?.[0];
      const data = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;
      const finishReason = geminiResponse?.candidates?.[0]?.finishReason;
      const blockReason = geminiResponse?.promptFeedback?.blockReason;
      const isProhibitedContent =
        finishReason === FinishReason.PROHIBITED_CONTENT ||
        blockReason === 'PROHIBITED_CONTENT';

      if (finishReason !== FinishReason.STOP || !data || !mimeType) {
        const code = isProhibitedContent
          ? 'content_policy_violation'
          : 'server_error';
        const message = isProhibitedContent
          ? getErrorMessage('PROHIBITED_CONTENT', 'voice-generation')
          : getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation');
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

      const audioBuffer = convertToWav(data, mimeType);
      uploadUrl = await uploadFileToR2(
        filename,
        audioBuffer,
        'audio/wav',
        speechApiBucket,
        process.env.R2_SPEECH_API_PUBLIC_URL,
      );
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
    const dollarAmount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider,
      model,
      inputChars: finalText.length,
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
        duration: '-1',
        credits_used: creditsUsed,
        usage: {
          ...(usageMetadata ?? {}),
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
      durationSeconds: null,
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
