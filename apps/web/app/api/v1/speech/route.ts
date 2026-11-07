import { createApiError, zodErrorToApiError } from '@/lib/api/errors';
import { externalApiErrorResponse } from '@/lib/api/external-errors';
import { withExternalApi } from '@/lib/api/handler';
import { VoiceGenerationRequestSchema } from '@/lib/api/schemas';
import { formatDurationSeconds, getAudioDuration } from '@/lib/audio';
import {
  type CreditReservation,
  reserveCredits,
} from '@/lib/credits/reservation';
import { audioFolder } from '@/lib/storage/layout';
import { uploadFileToR2 } from '@/lib/storage/upload';
import {
  getCreditsAdmin,
  getVoiceByIdAdmin,
  getVoiceIdByNameAdmin,
  hasUserPaidAdmin,
  insertUsageEvent,
  isInsufficientCreditsError,
  saveAudioFileAdmin,
} from '@/lib/supabase/queries';
import { validateGenerationInput } from '@/lib/tts/generation-input';
import {
  creditsFromTokens,
  getTtsModelId,
  TTS_MODELS,
  type TtsProvider,
} from '@/lib/tts/models';
import { speechProviderCost } from '@/lib/tts/provider-cost';
import { SpeechError, synthesizeSpeech } from '@/lib/tts/synthesize';
import { normalizeXaiTtsCodec } from '@/lib/tts/xai';

const ENDPOINT = '/api/v1/speech';

/** Provider names in Axiom logs. */
const LOG_PROVIDER_NAMES = {
  gemini: 'google',
  grok: 'xai',
  replicate: 'replicate',
} as const satisfies Record<TtsProvider, string>;

/** External API error for each reason a provider produced no audio. */
function speechErrorBody(error: SpeechError) {
  switch (error.kind) {
    case 'content_blocked':
      return {
        code: 'content_policy_violation',
        message: error.message,
        param: 'input',
        status: 422,
        type: 'invalid_request_error',
      } as const;
    case 'input_too_long':
      return {
        code: 'input_too_long',
        message: 'The input text is too long for this voice',
        param: 'input',
        status: 400,
        type: 'invalid_request_error',
      } as const;
    case 'no_audio':
      return {
        code: 'server_error',
        message: error.message,
        status: 503,
        type: 'server_error',
      } as const;
    case 'provider_unavailable':
      return {
        code: 'provider_unavailable',
        message: error.message,
        status: 503,
        type: 'server_error',
      } as const;
    case 'quota_exceeded':
      return {
        code: 'provider_quota_exceeded',
        message: error.message,
        status: 429,
        type: 'rate_limit_error',
      } as const;
    case 'unexpected_response':
      return {
        code: 'server_error',
        message: error.message,
        status: 500,
        type: 'server_error',
      } as const;
    default:
      return {
        code: 'server_error',
        message:
          error.kind === 'provider_error' && error.provider === 'grok'
            ? error.message
            : 'Internal server error',
        status: 500,
        type: 'server_error',
      } as const;
  }
}

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 800; // seconds - fluid compute is enabled

export const POST = withExternalApi(
  ENDPOINT,
  async (request, { auth, log, rateLimit, requestId, respond }) => {
    let reservation: CreditReservation | null = null;
    const releaseReservation = async (context: string) => {
      const refund = await reservation?.release(context);
      if (refund && !refund.ok) {
        await log({
          apiKeyId: auth.apiKeyId,
          error: refund.error,
          errorCode: 'credit_refund_failed',
          status: 500,
          userId: auth.userId,
        });
      }
    };

    // Fail fast on misconfiguration before credit checks, voice lookups and
    // generation. The env-var names stay out of the response body.
    const speechApiBucket = process.env.R2_SPEECH_API_BUCKET_NAME;
    const speechApiPublicUrl = process.env.R2_SPEECH_API_PUBLIC_URL;
    if (!(speechApiBucket && speechApiPublicUrl)) {
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

    let textLength = 0;
    let voice: string | undefined;
    let modelUsed: string | undefined;
    let provider: string | undefined;

    try {
      const payload = await request.json();

      const parsed = VoiceGenerationRequestSchema.safeParse(payload);
      if (!parsed.success) {
        await log({
          apiKeyId: auth.apiKeyId,
          error: parsed.error.message,
          errorCode: 'validation_error',
          status: 400,
          userId: auth.userId,
        });
        return respond(zodErrorToApiError(parsed.error), { status: 400 });
      }

      const { input, response_format, style, seed, temperature, speed } =
        parsed.data;
      const requestedVoice = parsed.data.voice;
      const requestedVoiceId = parsed.data.voiceId;
      const requestedModel = parsed.data.model;
      textLength = input.length;

      const userId = auth.userId;

      let voiceObj: Awaited<ReturnType<typeof getVoiceIdByNameAdmin>> | null =
        null;
      if (requestedVoiceId) {
        voiceObj = await getVoiceByIdAdmin(requestedVoiceId);
      } else if (requestedVoice) {
        voiceObj = await getVoiceIdByNameAdmin(
          requestedVoice,
          true,
          requestedModel ? TTS_MODELS[requestedModel].dbModels : undefined,
        );
      }

      const model = getTtsModelId(voiceObj?.model);
      if (!(voiceObj && model)) {
        await log({
          apiKeyId: auth.apiKeyId,
          errorCode: 'voice_not_found',
          model: requestedModel,
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
              : `Voice "${requestedVoice}" was not found for model "${requestedModel}"`,
            param: requestedVoiceId ? 'voiceId' : 'voice',
            type: 'not_found_error',
          }),
          { status: 404 },
        );
      }

      voice = voiceObj.name;
      modelUsed = voiceObj.model;
      const ttsModel = TTS_MODELS[model];
      provider = LOG_PROVIDER_NAMES[ttsModel.provider];
      const isGeminiVoice = ttsModel.provider === 'gemini';
      const isGrokVoice = ttsModel.provider === 'grok';

      const userHasPaid = await hasUserPaidAdmin(userId);
      // Unlike the dashboard, the external API has no separate style limit:
      // the style counts toward the input limit. Settings are validated by
      // VoiceGenerationRequestSchema, which rejects values out of range.
      const check = validateGenerationInput(ttsModel, {
        isPaidUser: userHasPaid,
        style,
        text: input,
      });
      if (input.length + (check.style?.length ?? 0) > check.textLimit) {
        const lengthErrorMessage = check.style
          ? `The input text exceeds the maximum length of ${check.textLimit} characters after applying style`
          : `The input text exceeds the maximum length of ${check.textLimit} characters`;
        await log({
          apiKeyId: auth.apiKeyId,
          errorCode: 'input_too_long',
          model,
          status: 400,
          textLength: input.length,
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

      const chosenFormat = response_format ?? ttsModel.formats[0];
      if (!(ttsModel.formats as readonly string[]).includes(chosenFormat)) {
        await log({
          apiKeyId: auth.apiKeyId,
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
      const estimatedCredits = ttsModel.estimateCredits(input, voice);
      if (currentCredits < estimatedCredits) {
        await log({
          apiKeyId: auth.apiKeyId,
          errorCode: 'insufficient_credits',
          model,
          status: 402,
          textLength: input.length,
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
        reservation = await reserveCredits({
          actor: 'service',
          amount: estimatedCredits,
          telemetry: {
            apiKeyId: auth.apiKeyId,
            endpoint: ENDPOINT,
            requestId,
          },
          userId,
        });
      } catch (error) {
        if (!isInsufficientCreditsError(error)) {
          throw error;
        }

        await log({
          apiKeyId: auth.apiKeyId,
          errorCode: 'insufficient_credits',
          model,
          status: 402,
          textLength: input.length,
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

      const filename = `${audioFolder('speech', userHasPaid)}/${voice}-${Date.now()}.${chosenFormat}`;

      const speech = await synthesizeSpeech(
        {
          codec: normalizeXaiTtsCodec(chosenFormat),
          dbModel: voiceObj.model,
          language: voiceObj.language,
          model: ttsModel,
          seed,
          speed,
          style,
          temperature,
          text: input,
          voiceName: voice,
        },
        {
          extra: {
            apiKeyId: auth.apiKeyId,
            endpoint: ENDPOINT,
            requestId,
          },
          user: { id: userId },
        },
      );
      modelUsed = speech.runtimeModel;

      const uploadUrl = await uploadFileToR2(
        filename,
        speech.audio,
        speech.mimeType,
        speechApiBucket,
        speechApiPublicUrl,
      );

      const durationSeconds = await getAudioDuration(
        speech.audio,
        speech.mimeType,
      );

      const creditsUsed =
        speech.totalTokens === undefined
          ? estimatedCredits
          : creditsFromTokens(speech.totalTokens);
      const settlement = await reservation.settle(
        creditsUsed,
        'speech_success',
      );
      const creditsDebited = settlement.debited;
      if (settlement.outcome === 'partial_debit') {
        await log({
          apiKeyId: auth.apiKeyId,
          creditsUsed: creditsDebited,
          errorCode: 'credit_partial_debit',
          status: 200,
          userId,
        });
      } else if (
        settlement.outcome === 'debit_failed' ||
        settlement.outcome === 'refund_failed'
      ) {
        await log({
          apiKeyId: auth.apiKeyId,
          error: settlement.error,
          errorCode:
            settlement.outcome === 'debit_failed'
              ? 'credit_debit_failed'
              : 'credit_refund_failed',
          status: 500,
          userId,
        });
      }

      const dollarAmount = speechProviderCost({
        candidatesTokenCount: speech.usage?.candidatesTokenCount,
        inputChars: input.length,
        model: modelUsed,
        promptTokenCount: speech.usage?.promptTokenCount,
      });
      const [audioFileResult, updatedCredits] = await Promise.all([
        saveAudioFileAdmin({
          credits_used: creditsDebited,
          duration: formatDurationSeconds(durationSeconds),
          filename,
          isPublic: false,
          model: modelUsed,
          predictionId: speech.predictionId,
          text: input,
          url: uploadUrl,
          usage: {
            ...speech.usage,
            apiKeyId: auth.apiKeyId,
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
        apiKeyId: auth.apiKeyId,
        creditsUsed: creditsDebited,
        dollarAmount,
        durationSeconds,
        inputChars: input.length,
        metadata: {
          ...speech.usage,
          model: modelUsed,
          textLength: input.length,
          textPreview: input.slice(0, 100),
          voiceId: voiceObj.id,
          voiceName: voice,
          ...(seed === undefined ? {} : { seed }),
          isGeminiVoice,
          isGrokVoice,
          predictionId: speech.predictionId ?? null,
          userHasPaid,
        },
        model: modelUsed,
        quantity: input.length,
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
        apiKeyId: auth.apiKeyId,
        creditsUsed: creditsDebited,
        dollarAmount,
        isGeminiVoice,
        isGrokVoice,
        model: modelUsed,
        provider,
        status: 200,
        textLength: input.length,
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
            input_characters: input.length,
            model: modelUsed,
          },
        },
        { status: 200 },
      );
    } catch (error) {
      if (error instanceof SpeechError) {
        await releaseReservation(`speech_${error.kind}`);
        const failure = speechErrorBody(error);
        await log({
          apiKeyId: auth.apiKeyId,
          error: failure.message,
          errorCode: failure.code,
          model: modelUsed,
          provider,
          providerCode: error.google?.code,
          providerStatus: error.google?.status,
          status: failure.status,
          textLength,
          userId: auth.userId,
          voice,
        });
        return respond(
          createApiError({
            code: failure.code,
            message: failure.message,
            param: 'param' in failure ? failure.param : null,
            type: failure.type,
          }),
          { status: failure.status },
        );
      }

      await releaseReservation('speech_failure');

      if (error instanceof SyntaxError) {
        await log({
          apiKeyId: auth.apiKeyId,
          error: error.message,
          errorCode: 'invalid_json',
          status: 400,
          userId: auth.userId,
        });
        return externalApiErrorResponse({
          key: 'invalid_json',
          rateLimit,
          requestId,
        });
      }

      throw error;
    }
  },
);

export const runtime = 'nodejs';
