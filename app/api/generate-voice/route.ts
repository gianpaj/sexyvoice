import { type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { getCharactersLimit } from '@/lib/ai';
import { convertToWav } from '@/lib/audio';
import { APIError } from '@/lib/error-ts';
import PostHogClient from '@/lib/posthog';
import {
  getCredits,
  getVoiceIdByName,
  isFreemiumUserOverLimit,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCredits } from '@/lib/utils';

const { logger } = Sentry;

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
export const maxDuration = 60; // seconds - fluid compute is enabled

// Initialize Redis
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  let text = '';
  let voice = '';
  let styleVariant = '';
  let user: User | null = null;
  try {
    const body = await request.json();

    if (request.body === null) {
      logger.error('Request body is empty', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return new Response('Request body is empty', { status: 400 });
    }
    text = body.text || '';
    voice = body.voice || '';
    styleVariant = body.styleVariant || '';

    if (!text || !voice) {
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
      Sentry.captureException({ error: 'Voice not found', voice, text });
      return NextResponse.json(
        new APIError(
          'Voice not found',
          new Response('Voice not found', {
            status: 400,
          }),
        ),
        { status: 404 },
      );
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
        new APIError(
          `Text exceeds the maximum length of ${maxLength} characters`,
          new Response(
            `Text exceeds the maximum length of ${maxLength} characters`,
            {
              status: 400,
            },
          ),
        ),
        { status: 400 },
      );
    }

    const currentAmount = await getCredits(user.id);

    const estimate = estimateCredits(text, voice, voiceObj.model);

    // console.log({ estimate });

    if (currentAmount < estimate) {
      logger.warn('Insufficient credits', {
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

    if (isGeminiVoice) {
      const isOverLimit = await isFreemiumUserOverLimit(user.id);
      if (isOverLimit) {
        return NextResponse.json(
          {
            error: 'You have exceeded the limit of 4 gpro voice generations as a free user. Please try a different voice or upgrade your plan for unlimited access.',
            errorCode: 'gproLimitExceeded',
          },
          { status: 403 },
        );
      }
    }

    let predictionResult: Prediction | undefined;
    let modelUsed = voiceObj.model;
    let blobResult: any;

    if (isGeminiVoice) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const geminiTTSConfig = {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice.charAt(0).toUpperCase() + voice.slice(1),
            },
          },
        },
      };
      let response: GenerateContentResponse | null;
      try {
        modelUsed = 'gemini-2.5-pro-preview-tts';
        response = await ai.models.generateContent({
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
        response = await ai.models.generateContent({
          model: modelUsed,
          contents: [{ parts: [{ text }] }],
          config: geminiTTSConfig,
        });
      }
      const data =
        response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType =
        response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;
      if (!data || !mimeType) {
        logger.error('Gemini voice generation failed - no data or mimeType', {
          hasData: !!data,
          mimeType,
        });
        throw new Error('Voice generation failed');
      }

      const audioBuffer = convertToWav(data, mimeType || 'wav');
      blobResult = await put(filename, audioBuffer, {
        access: 'public',
        contentType: 'audio/wav',
        allowOverwrite: true,
      });
    } else {
      // uses REPLICATE_API_TOKEN
      const replicate = new Replicate();
      const input = { text, voice };
      const onProgress = (prediction: Prediction) => {
        predictionResult = prediction;
      };
      const output = (await replicate.run(
        // @ts-ignore
        voiceObj.model,
        { input, signal: request.signal },
        onProgress,
      )) as ReadableStream;

      if ('error' in output) {
        const errorObj = {
          text,
          voice,
          model: voiceObj.model,
          errorData: output.error,
        };
        Sentry.captureException({
          error: 'Voice generation failed',
          user: { id: user.id, email: user.email },
          ...errorObj,
        });
        console.error(errorObj);
        // @ts-ignore
        throw new Error(output.error || 'Voice generation failed');
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
        Sentry.captureException({
          error: 'User not found',
        });
        return;
      }

      await reduceCredits({ userId: user.id, currentAmount, amount: estimate });

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: blobResult.url,
        model: modelUsed,
        predictionId: predictionResult?.id,
        isPublic: false,
        voiceId: voiceObj.id,
        duration: '-1',
        credits_used: estimate,
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          voice,
          model: modelUsed,
          errorData: audioFileDBResult.error,
        };
        Sentry.captureException({
          error: 'Failed to insert audio file row',
          ...errorObj,
        });
        console.error(errorObj);
      }

      await sendPosthogEvent({
        userId: user.id,
        predictionId: predictionResult?.id,
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
    Sentry.captureException({
      error: 'Voice generation error',
      user: user ? { id: user.id, email: user.email } : undefined,
      ...errorObj,
    });
    console.error(errorObj);
    console.error('Voice generation error:', error);

    // Gemini - You exceeded your current quota, please check your plan and billing details
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 429
    ) {
      logger.warn('Third-party API quota exceeded', { status: 429 });
      return NextResponse.json(
        { error: 'Third-party API Quota exceeded' },
        { status: 429 },
      );
    }
    if (error instanceof Error) {
      // if Gemini error
      if (error instanceof Error && error.message.includes('googleapis')) {
        const message = JSON.parse(error.message);
        // You exceeded your current quota
        if (message.error.code === 429) {
          return NextResponse.json(
            {
              error:
                'We have exceeded our third-party API current quota, please try later or tomorrow',
            },
            { status: 500 },
          );
        }
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
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
      predictionId: predictionId,
      model,
      text,
      voiceId,
      credits_used: creditUsed,
      textLength: text.length,
    },
  });
  await posthog.shutdown();
}
