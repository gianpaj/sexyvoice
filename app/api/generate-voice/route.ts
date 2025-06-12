import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { APIError } from '@/lib/error-ts';
import PostHogClient from '@/lib/posthog';
import {
  getCredits,
  getVoiceIdByName,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCredits } from '@/lib/utils';

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
  try {
    const body = await request.json();

    if (request.body === null) {
      return new Response('Request body is empty', { status: 400 });
    }
    text = body.text || '';
    voice = body.voice || '';

    if (!text || !voice) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        new APIError(
          'Text exceeds the maximum length of 500 characters',
          new Response('Text exceeds the maximum length of 500 characters', {
            status: 400,
          }),
        ),
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
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

    const currentAmount = await getCredits(user.id);

    const estimate = estimateCredits(text, voice);

    // console.log({ estimate });

    if (currentAmount < estimate) {
      Sentry.captureMessage('Insufficient credits', {
        user: { id: user.id, email: user.email },
        extra: { voice, text, estimate, currentCreditsAmount: currentAmount },
      });
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 },
      );
    }

    // Generate hash for the combination of text, voice, and accent
    const hash = await generateHash(text, voice);

    const abortController = new AbortController();

    const path = `audio/${voice}-${hash}`;

    request.signal.addEventListener('abort', () => {
      console.log('request aborted. hash:', hash);
      abortController.abort();
    });

    const filename = `${path}.wav`;
    const result = await redis.get(filename);

    if (result) {
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

    // uses REPLICATE_API_TOKEN
    const replicate = new Replicate();

    const input = {
      text,
      voice,
      // top_p: 0.95,
      // temperature: 0.6,
      // max_new_tokens: 1200, // max is 2000
      // repetition_penalty: 1.1
    };
    let predictionResult: Prediction | undefined;
    const onProgress = (prediction: Prediction) => {
      predictionResult = prediction;
    };
    const output = (await replicate.run(
      // @ts-ignore
      voiceObj.model,
      { input, signal: request.signal },
      onProgress,
    )) as ReadableStream;

    // console.log({ output });

    if ('error' in output) {
      const errorObj = {
        text,
        voice,
        model: voiceObj.model,
        errorData: output.error,
      };
      Sentry.captureException({
        error: 'Voice generation failed',
        ...errorObj,
      });
      console.error(errorObj);
      // @ts-ignore
      throw new Error(output.error || 'Voice generation failed');
    }

    // Use hash in the file path for future look ups
    const blobResult = await put(filename, output, {
      access: 'public',
      contentType: 'audio/mpeg',
      allowOverwrite: true,
    });

    await redis.set(filename, blobResult.url);

    after(async () => {
      await reduceCredits({ userId: user.id, currentAmount, amount: estimate });

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: blobResult.url,
        model: voiceObj.model,
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
          model: voiceObj.model,
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
        model: voiceObj.model,
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
      ...errorObj,
    });
    console.error(errorObj);
    console.error('Voice generation error:', error);
    if (error instanceof Error) {
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
    },
  });
  await posthog.shutdown();
}
