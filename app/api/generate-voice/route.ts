import {
  FinishReason,
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { getCharactersLimit } from '@/lib/ai';
import { convertToWav, generateHash } from '@/lib/audio';
import PostHogClient from '@/lib/posthog';
import { uploadFileToR2 } from '@/lib/storage/upload';
import {
  getCredits,
  getVoiceIdByName,
  hasUserPaid,
  insertUsageEvent,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import {
  calculateCreditsFromTokens,
  ERROR_CODES,
  estimateCredits,
  extractMetadata,
  getErrorMessage,
  getErrorStatusCode,
} from '@/lib/utils';

const { logger, captureException } = Sentry;

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 320; // seconds - fluid compute is enabled

// Initialize Redis
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  let text = '';
  let voice = '';
  let styleVariant = '';
  let user: User | null = null;
  let userHasPaid = false;
  try {
    if (request.body === null) {
      logger.error('Request body is empty', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return new Response('Request body is empty', { status: 400 });
    }

    const body = await request.json();
    text = body.text || '';
    voice = body.voice || '';
    styleVariant = body.styleVariant || '';

    if (!(text && voice)) {
      logger.error('Missing required parameters: text or voice', {
        body,
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    user = data?.user;

    if (!user) {
      logger.error('User not found', {
        body,
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    Sentry.setUser({
      id: user.id,
      email: user.email,
    });

    const voiceObj = await getVoiceIdByName(voice);

    if (!voiceObj) {
      const error = new Error('Voice not found');
      captureException(error, { extra: { voice, text } });
      return NextResponse.json({ error: 'Voice not found' }, { status: 404 });
    }

    const isGeminiVoice = voiceObj.model === 'gpro';

    const maxLength = getCharactersLimit(voiceObj.model);
    if (text.length > maxLength) {
      logger.error('Text exceeds maximum length', {
        textLength: text.length,
        maxLength,
        body,
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json(
        { error: `Text exceeds the maximum length of ${maxLength} characters` },
        { status: 400 },
      );
    }

    const currentAmount = await getCredits(user.id);

    const estimate = estimateCredits(text, voice, voiceObj.model);

    // console.log({ estimate });

    if (currentAmount < estimate) {
      logger.info('Insufficient credits', {
        user: { id: user.id, email: user.email },
        extra: { voice, text, estimate, currentCreditsAmount: currentAmount },
      });
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 },
      );
    }

    const finalText = styleVariant ? `${styleVariant}: ${text}` : text;
    text = finalText;

    // Generate hash for the combination of text, voice
    const hash = await generateHash(`${text}-${voice}`);

    const abortController = new AbortController();

    userHasPaid = await hasUserPaid(user.id);

    let folder = 'generated-audio-free';

    if (userHasPaid) {
      folder = 'generated-audio';
    }
    const path = `${folder}/${voice}-${hash}`;

    request.signal.addEventListener('abort', () => {
      logger.info('Request aborted by client', {
        user: {
          id: user?.id,
        },
        extra: {
          hash,
          voice,
          text,
        },
      });
      abortController.abort();
    });

    const filename = `${path}.wav`;
    const result = await redis.get<string>(filename);

    if (result) {
      logger.info('Cache hit - returning existing audio', {
        filename,
        url: result,
        creditsUsed: 0,
      });
      await sendPosthogEvent({
        userId: user.id,
        text,
        voiceId: voiceObj.id,
        creditUsed: 0,
        model: voiceObj.model,
      });

      // Return existing audio file URL
      return NextResponse.json({ url: result }, { status: 200 });
    }

    let replicateResponse: Prediction | undefined;
    let genAIResponse: GenerateContentResponse | null = null;
    let modelUsed = '';
    let uploadUrl = '';

    if (isGeminiVoice) {
      // const isOverLimit = await isFreemiumUserOverLimit(user.id);
      // if (!userHasPaid && isOverLimit) {
      //   return NextResponse.json(
      //     {
      //       errorCode: 'gproLimitExceeded',
      //     },
      //     { status: 403 },
      //   );
      // }

      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const geminiTTSConfig: GenerateContentConfig = {
        abortSignal: abortController.signal,
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
        modelUsed = 'gemini-2.5-pro-preview-tts'; // inputTokenLimit = 8192, outputTokenLimit = 16384 - doesn't support createCachedContent

        genAIResponse = await ai.models.generateContent({
          model: modelUsed,
          contents: [{ parts: [{ text }] }],
          config: geminiTTSConfig,
        });
      } catch (error) {
        console.warn(error);
        if (error instanceof Error && error.name === 'AbortError') {
          console.info('Gemini voice generation aborted');
          return NextResponse.json(
            { error: 'Request aborted' },
            { status: 499 },
          );
        }
        logger.warn(
          `${modelUsed} failed, retrying with gemini-2.5-flash-preview-tts`,
          {
            error: Error.isError(error) ? error.message : String(error),
            originalModel: modelUsed,
          },
        );
        modelUsed = 'gemini-2.5-flash-preview-tts'; // inputTokenLimit = 8192, outputTokenLimit = 16384
        genAIResponse = await ai.models.generateContent({
          model: modelUsed,
          contents: [{ parts: [{ text }] }],
          config: geminiTTSConfig,
        });
      }
      const data =
        genAIResponse?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType =
        genAIResponse?.candidates?.[0]?.content?.parts?.[0]?.inlineData
          ?.mimeType;
      const finishReason = genAIResponse?.candidates?.[0]?.finishReason;
      const blockReason = genAIResponse?.promptFeedback?.blockReason;
      const isProhibitedContent =
        finishReason === FinishReason.PROHIBITED_CONTENT ||
        blockReason === 'PROHIBITED_CONTENT';

      if (finishReason !== FinishReason.STOP || !data || !mimeType) {
        if (isProhibitedContent) {
          logger.warn('Content generation prohibited by Gemini', {
            user: { id: user.id },
            model: modelUsed,
            text,
            blockReason,
            finishReason,
          });
        } else {
          logger.error('Gemini voice generation failed', {
            error: finishReason,
            finishReason,
            blockReason,
            hasData: !!data,
            mimeType,
            response: genAIResponse,
            model: modelUsed,
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
        throw new Error(
          isProhibitedContent
            ? getErrorMessage('PROHIBITED_CONTENT', 'voice-generation')
            : getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
          {
            cause: isProhibitedContent
              ? 'PROHIBITED_CONTENT'
              : 'OTHER_GEMINI_BLOCK',
          },
        );
      }
      logger.info('Gemini voice generation succeeded', {
        user: {
          id: user.id,
        },
        extra: {
          voice,
          model: modelUsed,
          responseId: genAIResponse.responseId,
          text,
        },
      });

      const audioBuffer = convertToWav(data, mimeType || 'wav');
      uploadUrl = await uploadFileToR2(filename, audioBuffer, 'audio/wav');
    } else {
      // uses REPLICATE_API_TOKEN
      modelUsed = voiceObj.model;
      const replicate = new Replicate();
      const onProgress = (prediction: Prediction) => {
        replicateResponse = prediction;
      };
      const output = (await replicate.run(
        voiceObj.model as `${string}/${string}`,
        { input: { text, voice }, signal: request.signal },
        onProgress,
      )) as ReadableStream;

      if ('error' in output) {
        const errorObj = {
          text,
          voice,
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
      const chunks: Uint8Array[] = [];
      const reader = output.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const audioBuffer = Buffer.concat(chunks);

      uploadUrl = await uploadFileToR2(filename, audioBuffer, 'audio/mpeg');
    }

    await redis.set(filename, uploadUrl);

    after(async () => {
      if (!user) {
        captureException(new Error('User not found'));
        return;
      }

      let creditsUsed = estimate;

      const usage = extractMetadata(
        isGeminiVoice,
        genAIResponse,
        replicateResponse,
      );

      if (isGeminiVoice && usage) {
        creditsUsed = calculateCreditsFromTokens(
          Number.parseInt(usage.totalTokenCount, 10),
        );
      }

      await reduceCredits({ userId: user.id, amount: creditsUsed });

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: uploadUrl,
        model: modelUsed,
        predictionId: replicateResponse?.id,
        isPublic: false,
        voiceId: voiceObj.id,
        duration: '-1',
        credits_used: creditsUsed,
        usage: {
          ...usage,
          userHasPaid,
        },
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          voice,
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
        creditsUsed,
        metadata: {
          voiceId: voiceObj.id,
          voiceName: voice,
          model: modelUsed,
          textPreview: text.slice(0, 100),
          textLength: text.length,
          isGeminiVoice,
          userHasPaid,
          predictionId: replicateResponse?.id ?? null,
        },
      });

      await sendPosthogEvent({
        userId: user.id,
        predictionId: replicateResponse?.id,
        text,
        voiceId: voiceObj.id,
        creditUsed: estimate,
        model: modelUsed,
      });
    });

    return NextResponse.json(
      {
        url: uploadUrl,
        creditsUsed: estimate,
        creditsRemaining: (currentAmount || 0) - estimate,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.info('Gemini voice generation aborted');
      return NextResponse.json({ error: 'Request aborted' }, { status: 499 });
    }
    const errorObj = {
      text,
      voice,
      errorData: error,
    };
    captureException(error, {
      extra: errorObj,
      user: user ? { id: user.id, email: user.email } : undefined,
    });
    console.error(errorObj);
    console.error('Voice generation error:', error);

    // if Gemini error
    if (Error.isError(error) && error.message.includes('googleapis')) {
      const message = JSON.parse(error.message);
      // You exceeded your current quota
      if (message.error.code === 429) {
        return NextResponse.json(
          {
            error: getErrorMessage(
              userHasPaid
                ? ERROR_CODES.THIRD_P_QUOTA_EXCEEDED
                : ERROR_CODES.FREE_QUOTA_EXCEEDED,
              'voice-generation',
            ),
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (
      Error.isError(error) &&
      Object.keys(ERROR_CODES).includes(String(error.cause))
    ) {
      return NextResponse.json(
        {
          error: error.message || 'Voice generation failed, please retry',
        },
        { status: getErrorStatusCode(error.cause) },
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate voice' },
      { status: 500 },
    );
  }
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
