import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { APIError } from '@/lib/error-ts';
import PostHogClient from '@/lib/posthog';
import {
  getCredits,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCredits } from '@/lib/utils';

async function generateHash(text: string, audioFilename: string) {
  const textEncoder = new TextEncoder();
  const combinedString = `${text}-${audioFilename}`;
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
  let audioFile: File | null = null;
  let audioPromptUrl = '';

  try {
    const formData = await request.formData();

    text = (formData.get('text') as string) || '';
    audioFile = formData.get('audio') as File | null;

    if (!text || !audioFile) {
      return NextResponse.json(
        { error: 'Missing required parameters: text and audio file' },
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

    // Validate audio file type
    if (!audioFile.type.startsWith('audio/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an audio file.' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const currentAmount = await getCredits(user.id);

    // Estimate credits for voice cloning (assuming higher cost than regular generation)
    const estimate = estimateCredits(text, 'clone') * 2; // Double cost for cloning

    if (currentAmount < estimate) {
      Sentry.captureException({ error: 'Insufficient credits', text });
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 },
      );
    }

    // Upload audio file to Vercel blob first
    const audioBlob = await put(
      `audio-prompts/${user.id}-${audioFile.name}`,
      audioFile,
      {
        access: 'public',
        contentType: audioFile.type,
      },
    );

    audioPromptUrl = audioBlob.url;

    // Generate hash for the combination of text and audio file
    const hash = await generateHash(text, audioFile.name);

    const abortController = new AbortController();

    const path = `audio/clone-${hash}`;

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
        audioPromptUrl,
        creditUsed: 0,
        model: 'chatterbox-tts',
      });
      // Return existing audio file URL
      return NextResponse.json({ url: result }, { status: 200 });
    }

    // uses REPLICATE_API_TOKEN
    const replicate = new Replicate();

    const input = {
      text,
      cfg_weight: 0.5,
      temperature: 0.8,
      exaggeration: 0.5,
      audio_prompt_path: audioPromptUrl,
    };

    let predictionResult: Prediction | undefined;
    const onProgress = (prediction: Prediction) => {
      predictionResult = prediction;
    };

    const modelId =
      'thomcle/chatterbox-tts:3f5f9c195086737dda710bf504330f71e786d0a361b505e377c8b10122af9d32';

    const output = await replicate.run(
      modelId,
      { input, signal: request.signal },
      onProgress,
    );

    // Properly check for error before proceeding
    if (output && typeof output === 'object' && 'error' in output) {
      const errorObj = {
        text,
        audioPromptUrl,
        model: 'chatterbox-tts',
        errorData: (output as { error: unknown }).error,
      };
      Sentry.captureException({
        error: 'Voice cloning failed',
        ...errorObj,
      });
      console.error(errorObj);
      throw new Error(
        (output as { error: string }).error || 'Voice cloning failed',
      );
    }

    // At this point, output should be a ReadableStream
    // Use hash in the file path for future lookups
    const blobResult = await put(filename, output as ReadableStream, {
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
        model: 'chatterbox-tts',
        predictionId: predictionResult?.id,
        isPublic: false,
        voiceId: 'cloned-voice', // Special ID for cloned voices
        duration: '-1',
        credits_used: estimate,
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          audioPromptUrl,
          model: 'chatterbox-tts',
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
        audioPromptUrl,
        creditUsed: estimate,
        model: 'chatterbox-tts',
      });
    });

    return NextResponse.json(
      {
        url: blobResult.url,
        creditsUsed: estimate,
        creditsRemaining: (currentAmount || 0) - estimate,
        audioPromptUrl, // Return the uploaded audio prompt URL for reference
      },
      { status: 200 },
    );
  } catch (error) {
    const errorObj = {
      text,
      audioPromptUrl,
      errorData: error,
    };
    Sentry.captureException({
      error: 'Voice cloning error',
      ...errorObj,
    });
    console.error(errorObj);
    console.error('Voice cloning error:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'Failed to clone voice' },
      { status: 500 },
    );
  }
}

async function sendPosthogEvent({
  userId,
  text,
  audioPromptUrl,
  predictionId,
  creditUsed,
  model,
}: {
  userId: string;
  text: string;
  audioPromptUrl: string;
  predictionId?: string;
  creditUsed: number;
  model: string;
}) {
  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'clone-voice',
    properties: {
      predictionId: predictionId,
      model,
      text,
      audioPromptUrl,
      credits_used: creditUsed,
    },
  });
  await posthog.shutdown();
}
