import { captureException } from '@sentry/nextjs';

import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import { createApiError, zodErrorToApiError } from '@/lib/api/errors';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { createLogger } from '@/lib/api/logger';
import { calculateExternalApiDollarAmount } from '@/lib/api/pricing';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { VoiceCloneRequestSchema } from '@/lib/api/schemas';
import {
  CloneServiceError,
  type CloneServiceErrorCode,
  calculateReferenceAudioEnhancementCredits,
  cloneVoiceWithReplicate,
  generateBufferHash,
  generateVoiceWithMistral,
  getAudioDuration,
  getReferenceAudioEnhancementDollarCost,
  processCloneReferenceAudio,
  REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION,
  REFERENCE_AUDIO_ENHANCEMENT_MAX_INPUT_BYTES,
  resolveCloneProvider,
  sanitizeFilename,
  validateAudioDuration,
  validateLocale,
} from '@/lib/clone/clone-service';
import { enhanceReferenceAudio } from '@/lib/clone/reference-audio-enhancement';
import {
  getCloneTextMaxLength,
  isCloneTextOverLimit,
} from '@/lib/clone/text-limits';
import { uploadFileToR2 } from '@/lib/storage/upload';
import {
  getCreditsAdmin,
  hasUserPaidAdmin,
  insertUsageEvent,
  reduceCreditsAdmin,
  saveAudioFileAdmin,
} from '@/lib/supabase/queries';
import { estimateCredits } from '@/lib/utils';

const ENDPOINT = '/api/v1/clone';

// Internal voice id used for cloned audio rows (mirrors the internal route).
const CLONE_VOICE_ID = '420c4014-7d6d-44ef-b87d-962a3124a170';

// Guard against fetching arbitrarily large reference files.
const REFERENCE_AUDIO_MAX_FETCH_BYTES = 25 * 1024 * 1024;

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 800; // seconds - fluid compute is enabled

interface CloneErrorMapping {
  code: string;
  param?: string | null;
  status: number;
  type: Parameters<typeof createApiError>[0]['type'];
}

const CLONE_ERROR_MAP: Record<CloneServiceErrorCode, CloneErrorMapping> = {
  unsupported_locale: {
    status: 400,
    code: 'unsupported_locale',
    type: 'invalid_request_error',
    param: 'locale',
  },
  audio_duration_unknown: {
    status: 400,
    code: 'invalid_reference_audio',
    type: 'invalid_request_error',
    param: 'reference_audio',
  },
  audio_duration_too_short: {
    status: 400,
    code: 'reference_audio_too_short',
    type: 'invalid_request_error',
    param: 'reference_audio',
  },
  audio_conversion_failed: {
    status: 400,
    code: 'unsupported_audio_format',
    type: 'invalid_request_error',
    param: 'reference_audio',
  },
  unsupported_audio_format: {
    status: 400,
    code: 'unsupported_audio_format',
    type: 'invalid_request_error',
    param: 'reference_audio',
  },
  guardrail_violation: {
    status: 422,
    code: 'content_policy_violation',
    type: 'invalid_request_error',
    param: 'input',
  },
  provider_unavailable: {
    status: 503,
    code: 'provider_unavailable',
    type: 'server_error',
    param: null,
  },
};

async function resolveReferenceAudio(data: {
  reference_audio_url?: string;
  reference_audio?: string;
  reference_audio_format?: string;
}): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  if (data.reference_audio_url) {
    const response = await fetch(data.reference_audio_url);
    if (!response.ok) {
      throw new CloneServiceError(
        'unsupported_audio_format',
        `Failed to download reference audio (status ${response.status})`,
        { param: 'reference_audio_url' },
      );
    }

    const contentLength = response.headers.get('content-length');
    if (
      contentLength &&
      Number.isFinite(Number(contentLength)) &&
      Number(contentLength) > REFERENCE_AUDIO_MAX_FETCH_BYTES
    ) {
      throw new CloneServiceError(
        'unsupported_audio_format',
        'Reference audio exceeds the maximum allowed size.',
        { param: 'reference_audio_url' },
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > REFERENCE_AUDIO_MAX_FETCH_BYTES) {
      throw new CloneServiceError(
        'unsupported_audio_format',
        'Reference audio exceeds the maximum allowed size.',
        { param: 'reference_audio_url' },
      );
    }

    const mimeType =
      response.headers.get('content-type')?.split(';')[0]?.trim() ||
      'audio/wav';
    const urlPath = new URL(data.reference_audio_url).pathname;
    const filename = urlPath.split('/').pop() || 'reference-audio';

    return { buffer: Buffer.from(arrayBuffer), mimeType, filename };
  }

  // base64 payload
  const base64 = (data.reference_audio ?? '').replace(
    /^data:[^;]+;base64,/,
    '',
  );
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new CloneServiceError(
      'unsupported_audio_format',
      'reference_audio is not valid base64-encoded audio.',
      { param: 'reference_audio' },
    );
  }
  const mimeType =
    data.reference_audio_format?.split(';')[0]?.trim() || 'audio/wav';
  return { buffer, mimeType, filename: 'reference-audio' };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Single entrypoint orchestrates validation, billing, cloning and persistence.
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
    return externalApiErrorResponse({ key: 'invalid_api_key', requestId });
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

  const userId = authResult.userId;

  try {
    const payload = await request.json();

    const parsed = VoiceCloneRequestSchema.safeParse(payload);
    if (!parsed.success) {
      await log({
        status: 400,
        errorCode: 'validation_error',
        error: parsed.error.message,
        userId,
        apiKeyId: authResult.apiKeyId,
      });
      return respond(zodErrorToApiError(parsed.error), { status: 400 });
    }

    const { input, enhance_reference_audio } = parsed.data;
    const locale = parsed.data.locale ?? 'en';
    const enhancementEnabled = enhance_reference_audio === true;

    // Validate locale early (cheap, before any I/O).
    validateLocale(locale);
    const provider = resolveCloneProvider(locale);

    const userHasPaid = await hasUserPaidAdmin(userId);
    if (isCloneTextOverLimit({ text: input, locale, userHasPaid })) {
      const maxLength = getCloneTextMaxLength(locale, userHasPaid);
      await log({
        status: 400,
        errorCode: 'input_too_long',
        userId,
        apiKeyId: authResult.apiKeyId,
        textLength: input.length,
      });
      return respond(
        createApiError({
          message: `The input text exceeds the maximum length of ${maxLength} characters`,
          type: 'invalid_request_error',
          code: 'input_too_long',
          param: 'input',
        }),
        { status: 400 },
      );
    }

    const reference = await resolveReferenceAudio(parsed.data);

    const processed = await processCloneReferenceAudio({
      buffer: reference.buffer,
      mimeType: reference.mimeType,
      filename: reference.filename,
      locale,
      enhancementEnabled,
    });

    let cloneBuffer = processed.buffer;
    let cloneMimeType = processed.mimeType;
    let cloneAudioHash = processed.audioHash;
    let cloneDuration = processed.duration;

    const baseCloneCredits = estimateCredits(input, 'clone');
    let creditsUsed = baseCloneCredits;
    let referenceAudioEnhanced = false;
    let enhancementCredits = 0;
    let enhancementDollarAmount = 0;
    let enhancementDurationSeconds: number | null = null;
    let enhancementModelUsed: string | null = null;
    let enhancementRequestId: string | null = null;

    if (enhancementEnabled) {
      if (
        processed.duration !== null &&
        processed.duration > REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION
      ) {
        return respond(
          createApiError({
            message: `Reference audio enhancement supports clips up to ${REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION} seconds`,
            type: 'invalid_request_error',
            code: 'reference_audio_too_long',
            param: 'reference_audio',
          }),
          { status: 400 },
        );
      }
      if (
        processed.buffer.length > REFERENCE_AUDIO_ENHANCEMENT_MAX_INPUT_BYTES
      ) {
        return respond(
          createApiError({
            message: 'Reference audio enhancement input exceeds size limit',
            type: 'invalid_request_error',
            code: 'reference_audio_too_large',
            param: 'reference_audio',
          }),
          { status: 400 },
        );
      }

      enhancementDurationSeconds = processed.duration;
      enhancementCredits = calculateReferenceAudioEnhancementCredits(
        enhancementDurationSeconds,
      );
      enhancementDollarAmount = getReferenceAudioEnhancementDollarCost(
        enhancementDurationSeconds,
      );

      try {
        const enhanced = await enhanceReferenceAudio({
          abortSignal: request.signal,
          buffer: processed.buffer,
          filename: reference.filename,
          mimeType: processed.mimeType,
        });
        cloneBuffer = enhanced.buffer;
        cloneMimeType = enhanced.mimeType;
        cloneAudioHash = await generateBufferHash(enhanced.buffer);
        cloneDuration =
          (await getAudioDuration(enhanced.buffer, enhanced.mimeType)) ??
          cloneDuration;
        referenceAudioEnhanced = true;
        enhancementModelUsed = enhanced.modelUsed;
        enhancementRequestId = enhanced.requestId;
        creditsUsed = baseCloneCredits + enhancementCredits;
      } catch (enhancementError) {
        // Enhancement is best-effort: fall back to the original reference audio.
        captureException(enhancementError, {
          extra: { requestId, endpoint: ENDPOINT, locale },
        });
        enhancementCredits = 0;
        enhancementDollarAmount = 0;
        enhancementDurationSeconds = null;
        creditsUsed = baseCloneCredits;
      }
    }

    validateAudioDuration(cloneDuration, provider);

    const currentCredits = await getCreditsAdmin(userId);
    if (currentCredits < creditsUsed) {
      await log({
        status: 402,
        errorCode: 'insufficient_credits',
        userId,
        apiKeyId: authResult.apiKeyId,
        textLength: input.length,
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
    const filename = `${folder}/clone-${cloneAudioHash.slice(0, 16)}-${Date.now()}.wav`;

    let modelUsed: string;
    let predictionId: string;
    let outputBuffer: Buffer;

    if (provider === 'mistral') {
      const result = await generateVoiceWithMistral(input, cloneBuffer);
      outputBuffer = result.buffer;
      modelUsed = result.modelUsed;
      predictionId = result.requestId;
    } else {
      // Replicate needs a public URL to the reference audio.
      const refFilename = sanitizeFilename(reference.filename);
      const refKey = `clone-voice-input-api/${userId}-${cloneAudioHash}-${refFilename}`;
      const referenceAudioUrl = await uploadFileToR2(
        refKey,
        cloneBuffer,
        cloneMimeType,
        speechApiBucket,
        process.env.R2_SPEECH_API_PUBLIC_URL,
      );
      const result = await cloneVoiceWithReplicate(
        input,
        locale,
        referenceAudioUrl,
      );
      outputBuffer = Buffer.from(await result.blob.arrayBuffer());
      modelUsed = result.modelUsed;
      predictionId = result.requestId;
    }

    const uploadUrl = await uploadFileToR2(
      filename,
      outputBuffer,
      'audio/wav',
      speechApiBucket,
      process.env.R2_SPEECH_API_PUBLIC_URL,
    );

    if (!uploadUrl) {
      throw new Error('uploadUrl is empty after cloning — this is a bug');
    }

    await reduceCreditsAdmin({ userId, amount: creditsUsed });

    const dollarAmount = calculateExternalApiDollarAmount({
      sourceType: 'api_voice_cloning',
      provider,
      inputChars: input.length,
    });

    const audioFileResult = await saveAudioFileAdmin({
      userId,
      filename,
      text: input,
      url: uploadUrl,
      model: modelUsed,
      predictionId,
      isPublic: false,
      voiceId: CLONE_VOICE_ID,
      duration: (cloneDuration ?? -1).toFixed(3),
      credits_used: creditsUsed,
      usage: {
        userHasPaid,
        apiKeyId: authResult.apiKeyId,
        sourceType: 'api_voice_cloning',
        dollarAmount,
        referenceAudioEnhanced,
      },
    });

    await insertUsageEvent({
      userId,
      sourceType: 'api_voice_cloning',
      sourceId: audioFileResult.data?.id ?? null,
      apiKeyId: authResult.apiKeyId,
      model: modelUsed,
      inputChars: input.length,
      unit: 'operation',
      quantity: 1,
      creditsUsed: baseCloneCredits,
      dollarAmount,
      requestId,
      metadata: {
        provider,
        model: modelUsed,
        locale,
        textPreview: input.slice(0, 100),
        textLength: input.length,
        audioDuration: cloneDuration,
        referenceAudioEnhanced,
        predictionId,
        userHasPaid,
      },
    });

    if (referenceAudioEnhanced && enhancementCredits > 0) {
      await insertUsageEvent({
        userId,
        sourceType: 'audio_processing',
        sourceId: audioFileResult.data?.id ?? null,
        apiKeyId: authResult.apiKeyId,
        requestId: enhancementRequestId ?? undefined,
        model: enhancementModelUsed ?? undefined,
        unit: 'secs',
        quantity: enhancementDurationSeconds ?? 0,
        durationSeconds: enhancementDurationSeconds ?? 0,
        creditsUsed: enhancementCredits,
        dollarAmount: enhancementDollarAmount,
        metadata: {
          operation: 'reference_audio_enhancement',
          provider: 'fal',
          model: enhancementModelUsed,
          voiceCloningModel: modelUsed,
          locale,
          userHasPaid,
        },
      });
    }

    log({
      status: 200,
      userId,
      apiKeyId: authResult.apiKeyId,
      model: modelUsed,
      textLength: input.length,
      provider,
      creditsUsed,
      dollarAmount,
      referenceAudioEnhanced,
      userHasPaid,
    }).catch((err) => {
      console.error('[clone] success-path log failed:', err);
    });

    return respond(
      {
        url: uploadUrl,
        credits_used: creditsUsed,
        credits_remaining: Math.max(0, currentCredits - creditsUsed),
        usage: {
          input_characters: input.length,
          model: modelUsed,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof CloneServiceError) {
      const mapping = CLONE_ERROR_MAP[error.code];
      await log({
        status: mapping.status,
        errorCode: error.code,
        error: error.message,
        userId,
        apiKeyId: authResult.apiKeyId,
      });
      return respond(
        createApiError({
          message: error.message,
          type: mapping.type,
          code: mapping.code,
          param: mapping.param ?? null,
        }),
        { status: mapping.status },
      );
    }

    if (error instanceof SyntaxError) {
      await log({
        status: 400,
        errorCode: 'invalid_json',
        error: error.message,
        userId,
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
        userId,
        apiKeyId: authResult.apiKeyId,
      },
    });
    await log({
      status: 500,
      errorCode: 'server_error',
      error: error instanceof Error ? error.message : String(error),
      userId,
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
