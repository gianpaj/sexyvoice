import {
  FinishReason,
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';
import { captureException } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import Replicate, { type Prediction } from 'replicate';

import { getCharactersLimit } from '@/lib/ai';
import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import { createApiError, zodErrorToApiError } from '@/lib/api/errors';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { getDefaultFormat, resolveExternalModelId } from '@/lib/api/model';
import { calculateExternalApiDollarAmount } from '@/lib/api/pricing';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { VoiceGenerationRequestSchema } from '@/lib/api/schemas';
import { convertToWav, generateHash } from '@/lib/audio';
import { uploadFileToR2 } from '@/lib/storage/upload';
import {
  getCredits,
  getVoiceIdByName,
  hasUserPaid,
  insertUsageEvent,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import {
  calculateCreditsFromTokens,
  ERROR_CODES,
  estimateCredits,
  extractMetadata,
  getErrorMessage,
} from '@/lib/utils';

const redis = Redis.fromEnv();

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Single entrypoint orchestrates validation, billing, generation and persistence.
export async function POST(request: Request) {
  const requestId = getExternalApiRequestId();

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return externalApiErrorResponse({
      key: 'missing_authorization_header',
      requestId,
    });
  }

  const authResult = await validateApiKey(authHeader);
  if (!authResult) {
    return externalApiErrorResponse({
      key: 'invalid_api_key',
      requestId,
    });
  }

  const rateLimit = await consumeRateLimit(authResult.keyHash);
  if (!rateLimit.allowed) {
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

  try {
    const payload = await request.json();

    const parsed = VoiceGenerationRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return respond(zodErrorToApiError(parsed.error), {
        status: 400,
      });
    }

    const { model, input, voice, response_format, style, seed } = parsed.data;
    const finalText = style ? `${style}: ${input}` : input;

    const userId = authResult.userId;

    let voiceObj: Awaited<ReturnType<typeof getVoiceIdByName>> | null = null;
    try {
      voiceObj = await getVoiceIdByName(voice);
    } catch {
      voiceObj = null;
    }

    if (!voiceObj) {
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

    const maxLength = getCharactersLimit(voiceObj.model);
    if (finalText.length > maxLength) {
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

    const currentCredits = await getCredits(userId);
    const estimatedCredits = estimateCredits(finalText, voice, voiceObj.model);
    if (currentCredits < estimatedCredits) {
      return respond(
        createApiError({
          message: 'Insufficient credits',
          type: 'permission_error',
          code: 'insufficient_credits',
        }),
        { status: 402 },
      );
    }

    const hash = await generateHash(`${finalText}-${voice}-${seed ?? 'none'}`);
    const userHasPaid = await hasUserPaid(userId);
    const folder = userHasPaid ? 'generated-audio' : 'generated-audio-free';
    const extension = defaultFormat;
    const filename = `${folder}/${voice}-${hash}.${extension}`;

    const cachedUrl = await redis.get<string>(filename);
    if (cachedUrl) {
      await insertUsageEvent({
        userId,
        sourceType: 'api_tts',
        apiKeyId: authResult.apiKeyId,
        model,
        inputChars: finalText.length,
        dollarAmount: 0,
        unit: 'chars',
        quantity: finalText.length,
        creditsUsed: 0,
        requestId,
        metadata: {
          voiceId: voiceObj.id,
          voiceName: voice,
          model,
          textLength: finalText.length,
          ...(seed !== undefined ? { seed } : {}),
          cached: true,
          endpoint: '/api/v1/speech',
        },
      });
      return respond(
        {
          url: cachedUrl,
          credits_used: 0,
          credits_remaining: currentCredits,
          cached: true,
          usage: {
            input_characters: finalText.length,
            model,
          },
        },
        { status: 200 },
      );
    }

    const speechApiBucket = process.env.R2_SPEECH_API_BUCKET_NAME;
    if (!speechApiBucket) {
      return respond(
        createApiError({
          message: 'R2_SPEECH_API_BUCKET_NAME is not configured',
          type: 'server_error',
          code: 'server_error',
        }),
        { status: 500 },
      );
    }

    const isGeminiVoice = voiceObj.model === 'gpro';
    const provider = isGeminiVoice ? 'google' : 'replicate';
    let modelUsed = voiceObj.model;
    let uploadUrl = '';
    let replicateResponse: Prediction | undefined;
    let geminiResponse: GenerateContentResponse | null = null;

    if (isGeminiVoice) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      const config: GenerateContentConfig = {
        responseModalities: ['AUDIO'],
        ...(seed !== undefined ? { seed } : {}),
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
      } catch {
        modelUsed = 'gemini-2.5-flash-preview-tts';
        geminiResponse = await ai.models.generateContent({
          model: modelUsed,
          contents: [{ parts: [{ text: finalText }] }],
          config,
        });
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
        return respond(
          createApiError({
            message,
            type: isProhibitedContent
              ? 'invalid_request_error'
              : 'server_error',
            code,
            param: isProhibitedContent ? 'input' : null,
          }),
          { status: isProhibitedContent ? 422 : 500 },
        );
      }

      const audioBuffer = convertToWav(data, mimeType);
      uploadUrl = await uploadFileToR2(
        filename,
        audioBuffer,
        'audio/wav',
        speechApiBucket,
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
        return respond(
          createApiError({
            message: getErrorMessage('REPLICATE_ERROR', 'voice-generation'),
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
      );
    }

    await redis.set(filename, uploadUrl);

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

    await reduceCredits({ userId, amount: creditsUsed });
    const dollarAmount = calculateExternalApiDollarAmount({
      sourceType: 'api_tts',
      provider,
      model,
      inputChars: finalText.length,
    });
    const audioFileResult = await saveAudioFile({
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
        ...(seed !== undefined ? { seed } : {}),
      },
    });

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
        ...(seed !== undefined ? { seed } : {}),
        isGeminiVoice,
        userHasPaid,
        predictionId: replicateResponse?.id ?? null,
      },
    });

    return respond(
      {
        url: uploadUrl,
        credits_used: creditsUsed,
        credits_remaining: Math.max(0, currentCredits - creditsUsed),
        cached: false,
        usage: {
          input_characters: finalText.length,
          model,
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
      return respond(
        createApiError({
          message: error.message,
          type: isPolicy ? 'invalid_request_error' : 'server_error',
          code: isPolicy ? 'content_policy_violation' : 'server_error',
        }),
        { status: isPolicy ? 422 : 500 },
      );
    }

    if (error instanceof SyntaxError) {
      return externalApiErrorResponse({
        key: 'invalid_json',
        rateLimit,
        requestId,
      });
    }

    captureException(error, {
      extra: {
        requestId,
        endpoint: '/api/v1/speech',
        userId: authResult.userId,
        apiKeyId: authResult.apiKeyId,
      },
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
