// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { after, NextResponse } from 'next/server';

import { resolveDurationString } from '@/lib/audio';
import {
  type CreditReservation,
  reserveCredits,
} from '@/lib/credits/reservation';
import { APIErrorResponse } from '@/lib/error-ts';
import PostHogClient from '@/lib/posthog';
import { getProviderUnavailableDetails } from '@/lib/provider-errors';
import { CANCELLED_CHARGE_FLOW } from '@/lib/sentry/server-filters';
import { uploadFileToR2 } from '@/lib/storage/upload';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import {
  getCredits,
  getVoiceById,
  hasUserPaid,
  insertUsageEvent,
  isInsufficientCreditsError,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { dashboardSpeechKey } from '@/lib/tts/cache-key';
import { resolveGeminiTtsModel } from '@/lib/tts/gemini-prompt';
import { validateGenerationInput } from '@/lib/tts/generation-input';
import { creditsFromTokens, getTtsModel } from '@/lib/tts/models';
import { speechProviderCost } from '@/lib/tts/provider-cost';
import {
  isAbortError,
  SpeechError,
  synthesizeSpeech,
} from '@/lib/tts/synthesize';

const { logger, captureException } = Sentry;

interface GenerationIdentity {
  email?: string;
  id: string;
}

/** Dashboard response for each reason a provider produced no audio. */
function speechErrorResponse(error: SpeechError): Response {
  switch (error.kind) {
    case 'aborted':
      return APIErrorResponse(error.message, 499);
    case 'content_blocked':
    case 'invalid_argument':
      return APIErrorResponse(error.message, 422);
    case 'input_too_long':
      return APIErrorResponse(error.message, 400);
    case 'no_audio':
      return APIErrorResponse(error.message, 503);
    case 'provider_unavailable':
      return APIErrorResponse(error.message, 503, {
        details: getProviderUnavailableDetails(error.provider),
        errorCode: 'PROVIDER_UNAVAILABLE',
      });
    case 'quota_exceeded':
      return APIErrorResponse(error.message, 429);
    default:
      return APIErrorResponse(error.message, 500);
  }
}

function reportCancelledCharge({
  creditsDebited,
  model,
  signal,
  transport,
  userId,
}: {
  creditsDebited: number;
  model: string;
  signal: AbortSignal;
  transport: 'json';
  userId: string;
}) {
  if (!signal.aborted || creditsDebited <= 0) return;

  Sentry.captureMessage('Voice generation charge retained after cancellation', {
    extra: { creditsDebited, model },
    fingerprint: [CANCELLED_CHARGE_FLOW],
    level: 'warning',
    tags: { flow: CANCELLED_CHARGE_FLOW, transport },
    user: { id: userId },
  });
}

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 600; // seconds - fluid compute is enabled

// Initialize Redis
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  let text = '';
  let voiceId = '';
  let voiceName = '';
  let user: GenerationIdentity | null = null;
  let userHasPaid = false;
  let modelUsed = '';
  let reservation: CreditReservation | null = null;
  let creditsDebited = 0;
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
    const styleVariant: string = body.styleVariant || '';
    const isSplit = body.split === true;
    const textImproved = body.textImproved === true;

    if (!(text && voiceId)) {
      logger.error('Missing required parameters: text or voiceId', {
        hasText: Boolean(text),
        hasVoiceId: Boolean(voiceId),
      });
      return APIErrorResponse('Missing required parameters', 400);
    }

    const supabase = await createClient();

    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      logger.error('User not found', {
        voiceId,
      });
      return APIErrorResponse('User not found', 401);
    }

    user = { email: claims.email, id: claims.sub };

    Sentry.setUser({
      email: user.email,
      id: user.id,
    });

    const voiceObj = await getVoiceById(voiceId);
    const ttsModel = getTtsModel(voiceObj?.model);

    if (!(voiceObj && ttsModel)) {
      const error = new Error('Voice not found');
      captureException(error, { extra: { text, voiceId } });
      return APIErrorResponse('Voice not found', 404);
    }

    voiceName = voiceObj.name;
    userHasPaid = await hasUserPaid(user.id);

    // Settings the voice ignores or the user's plan excludes are dropped, and
    // numbers are clamped, before they reach the cache key.
    const input = validateGenerationInput(ttsModel, {
      isPaidUser: userHasPaid,
      settings: body,
      style: styleVariant,
      text,
    });
    if (input.textTooLong) {
      return APIErrorResponse(
        `Text exceeds the maximum length of ${input.textLimit} characters`,
        400,
      );
    }
    if (input.styleTooLong) {
      return APIErrorResponse(
        `Style exceeds the maximum length of ${input.styleLimit} characters`,
        400,
      );
    }
    const { language, seed, speed, temperature } = input.settings;

    const currentAmount = await getCredits(user.id);

    const estimate = ttsModel.estimateCredits(text, voiceObj.name);

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

    // Resolve the provider model before constructing the cache key.
    const effectiveModel =
      ttsModel.provider === 'gemini'
        ? resolveGeminiTtsModel({ model: voiceObj.model })
        : voiceObj.model;

    const filename = await dashboardSpeechKey({
      isPaidUser: userHasPaid,
      language: language === 'auto' ? undefined : language,
      provider: ttsModel.provider,
      runtimeModel: effectiveModel,
      seed,
      speed,
      style: input.style,
      temperature,
      text,
      voiceName: voiceObj.name,
    });

    const abortController = new AbortController();

    request.signal.addEventListener('abort', () => {
      logger.info('Request aborted by client', {
        extra: {
          filename,
          text,
          voiceName: voiceObj.name,
        },
        user: {
          id: user?.id,
        },
      });
      abortController.abort();
    });

    const result = await redis.get<string>(filename);

    if (result) {
      logger.info('Cache hit - returning existing audio', {
        creditsUsed: 0,
        filename,
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

      return NextResponse.json(
        { cached: true, creditsUsed: 0, url: result },
        { status: 200 },
      );
    }

    reservation = await reserveCredits({
      actor: 'session',
      amount: estimate,
      userId: user.id,
    });

    const speech = await synthesizeSpeech(
      {
        codec: 'mp3',
        dbModel: voiceObj.model,
        language: language || voiceObj.language,
        model: ttsModel,
        seed,
        signal: abortController.signal,
        speed,
        style: input.style,
        temperature,
        text,
        voiceName: voiceObj.name,
      },
      { user },
    );
    modelUsed = speech.runtimeModel;

    const uploadUrl = await uploadFileToR2(
      filename,
      speech.audio,
      speech.mimeType,
    );
    await redis.set(filename, uploadUrl);

    const creditsUsed =
      speech.totalTokens === undefined
        ? estimate
        : creditsFromTokens(speech.totalTokens);

    ({ debited: creditsDebited } = await reservation.settle(
      creditsUsed,
      'generate_voice_success',
    ));

    const dollarAmount = speechProviderCost({
      candidatesTokenCount: speech.usage?.candidatesTokenCount,
      inputChars: text.length,
      model: modelUsed,
      promptTokenCount: speech.usage?.promptTokenCount,
    });

    const generatedBy = user;
    after(async () => {
      const duration = await resolveDurationString(
        speech.audio,
        speech.mimeType,
      );

      const audioFileDBResult = await saveAudioFile({
        credits_used: creditsDebited,
        duration,
        filename,
        isPublic: false,
        model: modelUsed,
        predictionId: speech.predictionId,
        text,
        url: uploadUrl,
        usage: {
          ...speech.usage,
          split: isSplit,
          textImproved,
          userHasPaid,
        },
        userId: generatedBy.id,
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
        inputChars: text.length,
        model: modelUsed,
        quantity: text.length,
        sourceId: audioFileDBResult.data?.id,
        sourceType: 'tts',
        unit: 'chars',
        userId: generatedBy.id,
        ...(dollarAmount > 0 ? { dollarAmount } : {}),
        metadata: {
          ...speech.usage,
          duration,
          model: modelUsed,
          predictionId: speech.predictionId ?? null,
          provider: ttsModel.provider,
          split: isSplit,
          textLength: text.length,
          textPreview: text.slice(0, 100),
          userHasPaid,
          voiceId: voiceObj.id,
          voiceName: voiceObj.name,
          ...(speech.codec ? { codec: speech.codec } : {}),
        },
      });

      await sendPosthogEvent({
        creditUsed: creditsDebited,
        model: modelUsed,
        predictionId: speech.predictionId,
        split: isSplit,
        text,
        userId: generatedBy.id,
        voiceId: voiceObj.id,
      });
    });

    return NextResponse.json(
      {
        creditsUsed: creditsDebited,
        url: uploadUrl,
      },
      { status: 200 },
    );
  } catch (error) {
    await reservation?.release('generate_voice_failure');

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

    if (error instanceof SpeechError) {
      return speechErrorResponse(error);
    }

    if (isAbortError(error)) {
      return APIErrorResponse('Request aborted', 499);
    }

    const errorObj = {
      errorData: error,
      ...(modelUsed ? { model: modelUsed } : {}),
      text,
      voice: voiceName,
    };
    captureException(error, {
      extra: errorObj,
      user: user ? { email: user.email, id: user.id } : undefined,
    });
    console.error('Voice generation error:', error);

    return APIErrorResponse('Failed to generate voice', 500);
  } finally {
    if (user) {
      reportCancelledCharge({
        creditsDebited,
        model: modelUsed,
        signal: request.signal,
        transport: 'json',
        userId: user.id,
      });
    }
  }
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
      predictionId,
      split,
      text,
      textLength: text.length,
      voiceId,
    },
  });
  await posthog.shutdown();
}
