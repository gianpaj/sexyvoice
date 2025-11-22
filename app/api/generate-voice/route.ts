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
import { put } from '@vercel/blob';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { getCharactersLimit } from '@/lib/ai';
import { convertToWav } from '@/lib/audio';
import PostHogClient from '@/lib/posthog';
import {
  getCredits,
  getVoiceIdByName,
  hasUserPaid,
  isFreemiumUserOverLimit,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import {
  ERROR_CODES,
  estimateCredits,
  extractMetadata,
  getErrorMessage,
} from '@/lib/utils';

const { logger, captureException } = Sentry;

async function generateHash(
  text: string,
  voice: string,
  // accent: string,
  // speed: string,
) {
  const textEncoder = new TextEncoder();
  const combinedString = `${text}-${voice}`;
  const data = textEncoder.encode(combinedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8);
}

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 320; // seconds - fluid compute is enabled

// Initialize Redis
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  let text = '';
  let voice = '';
  let styleVariant = '';
  let user: User | null = null;
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

    const voiceObj = await getVoiceIdByName(voice);

    if (!voiceObj) {
      captureException({ error: 'Voice not found', voice, text });
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

    // Generate hash for the combination of text, voice, and accent
    const hash = await generateHash(text, voice);

    const abortController = new AbortController();

    const path = `audio/${voice}-${hash}`;

    request.signal.addEventListener('abort', () => {
      logger.warn('Request aborted by client', { hash });
      abortController.abort();
    });

    const filename = `${path}.wav`;
    const result = await redis.get(filename);

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

    const userHasPaid = await hasUserPaid(user.id);
    if (isGeminiVoice) {
      const isOverLimit = await isFreemiumUserOverLimit(user.id);
      if (!userHasPaid && isOverLimit) {
        return NextResponse.json(
          {
            errorCode: 'gproLimitExceeded',
          },
          { status: 403 },
        );
      }
    }

    let replicateResponse: Prediction | undefined;
    let genAIResponse: GenerateContentResponse | null;
    let modelUsed = voiceObj.model;
    let blobResult: any;

    if (isGeminiVoice) {
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
        modelUsed = 'gemini-2.5-pro-preview-tts';
        genAIResponse = await ai.models.generateContent({
          model: modelUsed,
          contents: [{ parts: [{ text }] }],
          config: geminiTTSConfig,
        });
      } catch (error) {
        console.warn(error);
        logger.warn(
          `${modelUsed} failed, retrying with gemini-2.5-flash-preview-tts`,
          {
            error: error instanceof Error ? error.message : String(error),
            originalModel: modelUsed,
          },
        );
        modelUsed = 'gemini-2.5-flash-preview-tts';
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

      if (finishReason !== FinishReason.STOP || !data || !mimeType) {
        if (FinishReason.PROHIBITED_CONTENT === finishReason) {
          logger.warn('Content generation prohibited by Gemini', {
            user: { id: user.id },
            model: modelUsed,
            text,
          });
        } else {
          logger.error('Gemini voice generation failed', {
            error: finishReason,
            finishReason,
            hasData: !!data,
            mimeType,
            response: genAIResponse,
            model: modelUsed,
          });
          if (process.env.NODE_ENV === 'development') {
            console.dir(
              {
                error: finishReason,
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
          finishReason === FinishReason.PROHIBITED_CONTENT
            ? 'Content generation was prohibited by our provider. Please modify your input and try again.'
            : 'Voice generation failed, please retry',
          {
            cause:
              finishReason === FinishReason.PROHIBITED_CONTENT
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
      blobResult = await put(filename, audioBuffer, {
        access: 'public',
        contentType: 'audio/wav',
        allowOverwrite: true,
      });
    } else {
      // uses REPLICATE_API_TOKEN
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
        captureException({
          error: 'Voice generation failed',
          user: { id: user.id, email: user.email },
          ...errorObj,
        });
        console.error(errorObj);
        throw new Error(
          // @ts-expect-error
          output.error || 'Voice generation failed, please try again',
          {
            cause: 'REPLICATE_ERROR',
          },
        );
      }

      blobResult = await put(filename, output, {
        access: 'public',
        contentType: 'audio/mpeg',
        allowOverwrite: true,
      });
    }

    await redis.set(filename, blobResult.url);

    after(async () => {
      if (!user) {
        captureException({
          error: 'User not found',
        });
        return;
      }

      await reduceCredits({ userId: user.id, currentAmount, amount: estimate });

      const usage = extractMetadata(
        isGeminiVoice,
        genAIResponse,
        replicateResponse,
      );
      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: blobResult.url,
        model: modelUsed,
        predictionId: replicateResponse?.id,
        isPublic: false,
        voiceId: voiceObj.id,
        duration: '-1',
        credits_used: estimate,
        usage,
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          voice,
          model: modelUsed,
          errorData: audioFileDBResult.error,
        };
        captureException({
          error: 'Failed to insert audio file row',
          ...errorObj,
        });
        console.error(errorObj);
      }

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
        url: blobResult.url,
        creditsUsed: estimate,
        creditsRemaining: (currentAmount || 0) - estimate,
      },
      { status: 200 },
    );
  } catch (error) {
    const errorObj = {
      text,
      voice,
      errorData: error,
    };
    captureException({
      error: 'Voice generation error',
      user: user ? { id: user.id, email: user.email } : undefined,
      ...errorObj,
    });
    console.error(errorObj);
    console.error('Voice generation error:', error);

    // if Gemini error
    if (error instanceof Error && error.message.includes('googleapis')) {
      const message = JSON.parse(error.message);
      // You exceeded your current quota
      if (message.error.code === 429) {
        return NextResponse.json(
          {
            error: getErrorMessage(
              ERROR_CODES.THIRD_P_QUOTA_EXCEEDED,
              'voice-generation',
            ),
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (
      error instanceof Error &&
      Object.keys(ERROR_CODES).includes(String(error.cause))
    ) {
      return NextResponse.json(
        {
          error:
            getErrorMessage(error.cause, 'voice-generation') ||
            'Voice generation failed, please retry',
        },
        { status: 500 },
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
