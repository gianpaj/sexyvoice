import {
  FinishReason,
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';
import { Redis } from '@upstash/redis';
import Replicate, { type Prediction } from 'replicate';

import { getCharactersLimit } from '@/lib/ai';
import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import { createApiError, zodErrorToApiError } from '@/lib/api/errors';
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
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return jsonWithRateLimitHeaders(
      createApiError({
        message: 'Missing Authorization header',
        type: 'authentication_error',
        code: 'invalid_api_key',
        param: 'authorization',
      }),
      { status: 401 },
    );
  }

  const authResult = await validateApiKey(authHeader);
  if (!authResult) {
    return jsonWithRateLimitHeaders(
      createApiError({
        message: 'Invalid API key',
        type: 'authentication_error',
        code: 'invalid_api_key',
        param: 'authorization',
      }),
      { status: 401 },
    );
  }

  const rateLimit = await consumeRateLimit(authResult.keyHash);
  if (!rateLimit.allowed) {
    return jsonWithRateLimitHeaders(
      createApiError({
        message: 'Rate limit exceeded',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      }),
      { status: 429 },
      rateLimit,
    );
  }

  try {
    const payload = await request.json();
    const parsed = VoiceGenerationRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonWithRateLimitHeaders(
        zodErrorToApiError(parsed.error),
        {
          status: 400,
        },
        rateLimit,
      );
    }

    const { model, input, voice, response_format, speed, style } = parsed.data;

    if (speed !== 1) {
      return jsonWithRateLimitHeaders(
        createApiError({
          message: 'Only speed=1.0 is currently supported',
          type: 'invalid_request_error',
          code: 'speed_not_supported',
          param: 'speed',
        }),
        { status: 400 },
        rateLimit,
      );
    }

    const userId = authResult.userId;

    let voiceObj: Awaited<ReturnType<typeof getVoiceIdByName>> | null = null;
    try {
      voiceObj = await getVoiceIdByName(voice);
    } catch {
      voiceObj = null;
    }

    if (!voiceObj) {
      return jsonWithRateLimitHeaders(
        createApiError({
          message: `Voice "${voice}" was not found`,
          type: 'not_found_error',
          code: 'voice_not_found',
          param: 'voice',
        }),
        { status: 404 },
        rateLimit,
      );
    }

    const resolvedModel = resolveExternalModelId(voiceObj.model);
    if (model !== resolvedModel) {
      return jsonWithRateLimitHeaders(
        createApiError({
          message: `Voice "${voice}" is not available for model "${model}"`,
          type: 'invalid_request_error',
          code: 'model_not_found',
          param: 'model',
        }),
        { status: 400 },
        rateLimit,
      );
    }

    const maxLength = getCharactersLimit(voiceObj.model);
    if (input.length > maxLength) {
      return jsonWithRateLimitHeaders(
        createApiError({
          message: `The input text exceeds the maximum length of ${maxLength} characters`,
          type: 'invalid_request_error',
          code: 'input_too_long',
          param: 'input',
        }),
        { status: 400 },
        rateLimit,
      );
    }

    const defaultFormat = getDefaultFormat(resolvedModel);
    if (response_format && response_format !== defaultFormat) {
      return jsonWithRateLimitHeaders(
        createApiError({
          message: `Model "${model}" only supports "${defaultFormat}" output`,
          type: 'invalid_request_error',
          code: 'invalid_request_error',
          param: 'response_format',
        }),
        { status: 400 },
        rateLimit,
      );
    }

    const currentCredits = await getCredits(userId);
    const estimatedCredits = estimateCredits(input, voice, voiceObj.model);
    if (currentCredits < estimatedCredits) {
      return jsonWithRateLimitHeaders(
        createApiError({
          message: 'Insufficient credits',
          type: 'permission_error',
          code: 'insufficient_credits',
        }),
        { status: 402 },
        rateLimit,
      );
    }

    const finalText = style ? `${style}: ${input}` : input;
    const hash = await generateHash(`${finalText}-${voice}`);
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
        inputChars: input.length,
        dollarAmount: 0,
        unit: 'chars',
        quantity: input.length,
        creditsUsed: 0,
        metadata: {
          voiceId: voiceObj.id,
          voiceName: voice,
          model,
          textLength: input.length,
          cached: true,
          endpoint: '/api/v1/speech',
        },
      });
      return jsonWithRateLimitHeaders(
        {
          url: cachedUrl,
          credits_used: 0,
          credits_remaining: currentCredits,
          cached: true,
          usage: {
            input_characters: input.length,
            model,
          },
        },
        { status: 200 },
        rateLimit,
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
        return jsonWithRateLimitHeaders(
          createApiError({
            message,
            type: isProhibitedContent
              ? 'invalid_request_error'
              : 'server_error',
            code,
            param: isProhibitedContent ? 'input' : null,
          }),
          { status: isProhibitedContent ? 422 : 500 },
          rateLimit,
        );
      }

      const audioBuffer = convertToWav(data, mimeType);
      uploadUrl = await uploadFileToR2(filename, audioBuffer, 'audio/wav');
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
        return jsonWithRateLimitHeaders(
          createApiError({
            message: getErrorMessage('REPLICATE_ERROR', 'voice-generation'),
            type: 'server_error',
            code: 'server_error',
          }),
          { status: 500 },
          rateLimit,
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
      uploadUrl = await uploadFileToR2(filename, audioBuffer, 'audio/mpeg');
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
      inputChars: input.length,
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
      },
    });

    await insertUsageEvent({
      userId,
      sourceType: 'api_tts',
      sourceId: audioFileResult.data?.id ?? null,
      apiKeyId: authResult.apiKeyId,
      model: modelUsed,
      inputChars: input.length,
      durationSeconds: null,
      dollarAmount,
      unit: 'chars',
      quantity: finalText.length,
      creditsUsed,
      metadata: {
        voiceId: voiceObj.id,
        voiceName: voice,
        model: modelUsed,
        textPreview: finalText.slice(0, 100),
        textLength: finalText.length,
        isGeminiVoice,
        userHasPaid,
        predictionId: replicateResponse?.id ?? null,
      },
    });

    return jsonWithRateLimitHeaders(
      {
        url: uploadUrl,
        credits_used: creditsUsed,
        credits_remaining: Math.max(0, currentCredits - creditsUsed),
        cached: false,
        usage: {
          input_characters: input.length,
          model,
        },
      },
      { status: 200 },
      rateLimit,
    );
  } catch (error) {
    if (
      Error.isError(error) &&
      error.cause &&
      Object.values(ERROR_CODES).includes(error.cause as never)
    ) {
      const isPolicy = error.cause === ERROR_CODES.PROHIBITED_CONTENT;
      return jsonWithRateLimitHeaders(
        createApiError({
          message: error.message,
          type: isPolicy ? 'invalid_request_error' : 'server_error',
          code: isPolicy ? 'content_policy_violation' : 'server_error',
        }),
        { status: isPolicy ? 422 : 500 },
        rateLimit,
      );
    }

    if (
      Error.isError(error) &&
      error.message.includes('Unexpected end of JSON input')
    ) {
      return jsonWithRateLimitHeaders(
        createApiError({
          message: 'Invalid JSON payload',
          type: 'invalid_request_error',
          code: 'invalid_request',
        }),
        { status: 400 },
        rateLimit,
      );
    }

    console.error(error);
    return jsonWithRateLimitHeaders(
      createApiError({
        message: 'Internal server error',
        type: 'server_error',
        code: 'server_error',
      }),
      { status: 500 },
      rateLimit,
    );
  } finally {
    await updateApiKeyLastUsed(authResult.keyHash);
  }
}

export const runtime = 'nodejs';
