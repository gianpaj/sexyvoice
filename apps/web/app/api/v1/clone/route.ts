import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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
// Bound the time spent downloading a user-supplied reference URL.
const REFERENCE_AUDIO_FETCH_TIMEOUT_MS = 15_000;

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

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return a >= 224; // multicast / reserved
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

// Reject loopback, link-local, private, CGNAT, and reserved address ranges so a
// user-supplied URL cannot be used to reach internal services (SSRF).
function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 4 ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CloneServiceError(
      'unsupported_audio_format',
      'reference_audio_url is not a valid URL.',
      { param: 'reference_audio_url' },
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CloneServiceError(
      'unsupported_audio_format',
      'reference_audio_url must use http or https.',
      { param: 'reference_audio_url' },
    );
  }
  if (url.username || url.password) {
    throw new CloneServiceError(
      'unsupported_audio_format',
      'reference_audio_url must not contain credentials.',
      { param: 'reference_audio_url' },
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string }[];
  if (isIP(hostname)) {
    addresses = [{ address: hostname }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new CloneServiceError(
        'unsupported_audio_format',
        'reference_audio_url host could not be resolved.',
        { param: 'reference_audio_url' },
      );
    }
  }

  if (
    addresses.length === 0 ||
    addresses.some((a) => isPrivateAddress(a.address))
  ) {
    throw new CloneServiceError(
      'unsupported_audio_format',
      'reference_audio_url must point to a public host.',
      { param: 'reference_audio_url' },
    );
  }

  return url;
}

async function fetchReferenceAudioFromUrl(
  rawUrl: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const url = await assertPublicHttpUrl(rawUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      // Block redirect-based SSRF bypasses: a public URL must not bounce to an
      // internal host. Reference audio is expected to be a direct link.
      redirect: 'error',
      signal: AbortSignal.timeout(REFERENCE_AUDIO_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new CloneServiceError(
      'unsupported_audio_format',
      timedOut
        ? 'Timed out downloading reference_audio_url.'
        : 'Failed to download reference_audio_url. Provide a direct, publicly reachable link.',
      { param: 'reference_audio_url' },
    );
  }

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

  // Stream the body and abort once the hard byte cap is exceeded, so a missing
  // or spoofed content-length header cannot exhaust memory.
  const reader = response.body?.getReader();
  if (!reader) {
    throw new CloneServiceError(
      'unsupported_audio_format',
      'Failed to read reference audio stream.',
      { param: 'reference_audio_url' },
    );
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > REFERENCE_AUDIO_MAX_FETCH_BYTES) {
        await reader.cancel();
        throw new CloneServiceError(
          'unsupported_audio_format',
          'Reference audio exceeds the maximum allowed size.',
          { param: 'reference_audio_url' },
        );
      }
      chunks.push(value);
    }
  }

  const mimeType =
    response.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/wav';
  const filename = url.pathname.split('/').pop() || 'reference-audio';

  return { buffer: Buffer.concat(chunks), mimeType, filename };
}

async function resolveReferenceAudio(data: {
  reference_audio_url?: string;
  reference_audio?: string;
  reference_audio_format?: string;
}): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  if (data.reference_audio_url) {
    return await fetchReferenceAudioFromUrl(data.reference_audio_url);
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
  // Enforce the same hard size cap as the URL path so a large base64 body
  // cannot allocate unbounded memory.
  if (buffer.length > REFERENCE_AUDIO_MAX_FETCH_BYTES) {
    throw new CloneServiceError(
      'unsupported_audio_format',
      'Reference audio exceeds the maximum allowed size.',
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

    // Reference audio must satisfy the provider's minimum length before we
    // spend anything (credits or a paid enhancement call).
    validateAudioDuration(processed.duration, provider);

    if (enhancementEnabled) {
      if (
        processed.duration !== null &&
        processed.duration > REFERENCE_AUDIO_ENHANCEMENT_MAX_DURATION
      ) {
        await log({
          status: 400,
          errorCode: 'reference_audio_too_long',
          userId,
          apiKeyId: authResult.apiKeyId,
          textLength: input.length,
        });
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
        await log({
          status: 400,
          errorCode: 'reference_audio_too_large',
          userId,
          apiKeyId: authResult.apiKeyId,
          textLength: input.length,
        });
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
      // Provisionally bill the enhancement; affordability is verified below
      // before the paid enhancement call is made.
      creditsUsed = baseCloneCredits + enhancementCredits;
    }

    // Verify the user can afford the maximum cost BEFORE invoking any paid
    // provider call (including the expensive enhancement step). This prevents a
    // user with insufficient credits from forcing billable work that then 402s.
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

    if (enhancementEnabled) {
      try {
        const enhanced = await enhanceReferenceAudio({
          abortSignal: request.signal,
          buffer: processed.buffer,
          filename: reference.filename,
          mimeType: processed.mimeType,
        });
        cloneBuffer = enhanced.buffer;
        cloneMimeType = enhanced.mimeType;
        cloneAudioHash = generateBufferHash(enhanced.buffer);
        cloneDuration =
          (await getAudioDuration(enhanced.buffer, enhanced.mimeType)) ??
          cloneDuration;
        referenceAudioEnhanced = true;
        enhancementModelUsed = enhanced.modelUsed;
        enhancementRequestId = enhanced.requestId;
      } catch (enhancementError) {
        // Enhancement is best-effort: fall back to the original reference audio
        // and only bill the base clone credits.
        captureException(enhancementError, {
          extra: { requestId, endpoint: ENDPOINT, locale },
        });
        enhancementCredits = 0;
        enhancementDollarAmount = 0;
        enhancementDurationSeconds = null;
        creditsUsed = baseCloneCredits;
      }
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

    // Fire-and-forget: do not await the log on the success path. A flush failure
    // must never return a 500 after audio has been generated and credits have
    // already been deducted. (Mirrors /api/v1/speech.)
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
      // Prefer a more specific param from the error (e.g. reference_audio_url)
      // so the failure is attributed to the field the caller actually sent.
      const detailParam =
        typeof error.details?.param === 'string' ? error.details.param : null;
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
          param: detailParam ?? mapping.param ?? null,
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
