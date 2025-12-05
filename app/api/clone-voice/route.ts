import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { head, put } from '@vercel/blob';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { APIError, APIErrorResponse } from '@/lib/error-ts';
import { inngest } from '@/lib/inngest/client';
import PostHogClient from '@/lib/posthog';
import {
  getCredits,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCredits } from '@/lib/utils';

const { logger, captureException } = Sentry;

// File validation constants
const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
];
const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5MB
const MIN_DURATION = 5; // seconds
const MAX_DURATION = 5 * 60; // 5 minutes

async function generateHash(combinedString: string) {
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(combinedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8);
}

async function getAudioDuration(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<number | null> {
  try {
    const mm = await import('music-metadata');
    const metadata = await mm.parseBuffer(fileBuffer, mimeType);
    return metadata.format.duration ?? null;
  } catch (_e) {
    return null;
  }
}

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 320; // seconds - fluid compute is enabled

// Initialize Redis
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  let text = '';
  let userAudioFile: File | null = null;
  let audioPromptUrl = '';
  let locale = '';
  let replicateResponse: Prediction | undefined;
  let modelUsed = '';
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return APIErrorResponse('User not found', 401);
    }

    // Parse multipart/form-data
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return APIErrorResponse('Content-Type must be multipart/form-data', 400);
    }

    const formData = await request.formData();

    // Determine mode based on form data
    const textValue = formData.get('text');
    const file = formData.get('file');
    locale = formData.get('locale') as string;

    text = typeof textValue === 'string' ? textValue : '';
    userAudioFile = file instanceof File ? file : null;

    // Text-to-speech generation mode
    if (!(text && userAudioFile)) {
      return APIErrorResponse(
        'Missing required parameters: text and audio file',
        400,
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

    if (
      !(
        userAudioFile.type.startsWith('audio/') &&
        ALLOWED_TYPES.includes(userAudioFile.type)
      )
    ) {
      return APIErrorResponse(
        'Invalid file type. Only MP3, OGG, M4A, or WAV allowed.',
        400,
      );
    }

    if (userAudioFile.size > MAX_SIZE) {
      return APIErrorResponse('File too large. Max 4.5MB allowed.', 400);
    }

    // Read file buffer and validate duration
    const arrayBuffer = await userAudioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const duration = await getAudioDuration(buffer, userAudioFile.type);
    if (duration === null) {
      return APIErrorResponse('Could not determine audio duration.', 400);
    }
    if (duration < MIN_DURATION || duration > MAX_DURATION) {
      return APIErrorResponse(
        'Audio must be between 10 seconds and 5 minutes.',
        400,
      );
    }

    // Upload to Vercel Blob
    // const filename = `voice-clone/${user.id}-${Date.now()}-${audioFile.name}`;
    // const blobResult = await put(filename, buffer, {
    //   access: 'public',
    //   contentType: audioFile.type,
    //   allowOverwrite: false,
    // });

    // Handle text-to-speech generation mode
    const currentAmount = await getCredits(user.id);

    // Estimate credits for voice cloning generation (higher cost than regular)
    const estimate = estimateCredits(text, 'clone');

    if (currentAmount < estimate) {
      logger.info('Insufficient credits', {
        user: { id: user.id, email: user.email },
        extra: { text, estimate, currentCreditsAmount: currentAmount },
      });
      return NextResponse.json(
        {
          error: `Insufficient credits. You need ${estimate} credits to generate this audio`,
        },
        { status: 402 },
      );
    }

    // clean filename
    const userAudioFilename = sanitizeFilename(userAudioFile.name);

    const blobUrl = `clone-voice-input/${user.id}-${userAudioFilename}`;

    try {
      // TODO: hash also the audio based on the duration
      const existingAudio = await head(blobUrl);

      if (existingAudio) {
        audioPromptUrl = existingAudio.url;
      }
    } catch (_e) {
      // Upload audio file to Vercel blob for TTS generation
      const audioBlob = await put(blobUrl, buffer, {
        access: 'public',
        contentType: userAudioFile.type,
      });
      audioPromptUrl = audioBlob.url;
    }

    // Generate hash for caching
    const hash = await generateHash(`${locale}-${text}-${blobUrl}`);
    const abortController = new AbortController();
    const path = `clone-voice/${hash}`;
    const filename = `${path}.wav`;

    request.signal.addEventListener('abort', () => {
      console.log('request aborted. hash:', hash);
      abortController.abort();
    });

    // Check cache
    const cachedResult = await redis.get(filename);
    if (cachedResult) {
      await sendPosthogEvent({
        userId: user.id,
        event: 'clone-voice',
        text,
        locale,
        audioPromptUrl,
        creditUsed: 0,
        model: 'chatterbox-cached',
      });
      return NextResponse.json({ url: cachedResult }, { status: 200 });
    }

    // Generate TTS with cloned voice using Replicate
    const replicate = new Replicate();
    const onProgress = (prediction: Prediction) => {
      replicateResponse = prediction;
    };

    let model: `${string}/${string}`;
    let input: Record<string, unknown>;

    if (locale === 'en') {
      // Use chatterbox for English
      model = 'resemble-ai/chatterbox';
      input = {
        seed: 0,
        text,
        cfg_weight: 0.5,
        temperature: 0.8,
        exaggeration: 0.5,
        reference_audio: audioPromptUrl,
      };
    } else {
      // Use chatterbox-multilingual for non-English
      model =
        'resemble-ai/chatterbox-multilingual:9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c';
      input = {
        seed: 0,
        text,
        language: locale,
        cfg_weight: 0.5,
        temperature: 0.8,
        exaggeration: 0.5,
        reference_audio: audioPromptUrl,
      };
    }

    const output = (await replicate.run(model, { input }, onProgress)) as
      | string
      | { error?: string };

    if (typeof output === 'object' && 'error' in output) {
      const errorObj = {
        text,
        locale,
        audioPromptUrl,
        model,
        errorData: output.error,
      };
      captureException({
        error: 'Voice cloning failed',
        ...errorObj,
      });
      console.error(errorObj);
      throw new Error(
        output.error || 'Voice cloning failed, please try again',
        {
          cause: 'REPLICATE_ERROR',
        },
      );
    }

    const requestId = replicateResponse?.id || 'unknown';
    modelUsed = model.split(':')[0]; // Get model name without version hash

    // Fetch the audio file from the URL and upload to blob storage
    const audioResponse = await fetch(output as string);
    const audioBuffer = await audioResponse.arrayBuffer();

    const blobResult = await put(filename, audioBuffer, {
      access: 'public',
      contentType: 'audio/mpeg',
      allowOverwrite: true,
    });

    await redis.set(filename, blobResult.url);

    // Background tasks
    after(async () => {
      await reduceCredits({ userId: user.id, amount: estimate });

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: blobResult.url,
        model: modelUsed,
        predictionId: requestId,
        isPublic: false,
        voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
        duration: duration.toFixed(3),
        credits_used: estimate,
        usage: {
          locale,
        },
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          audioPromptUrl,
          model: 'chatterbox-tts',
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
        event: 'clone-voice',
        predictionId: requestId,
        text,
        locale,
        audioPromptUrl,
        creditUsed: estimate,
        model: modelUsed,
      });

      // delete the audio file uploaded
      await inngest.send({
        name: 'clone-audio/cleanup.scheduled',
        data: {
          blobUrl,
          userId: user.id,
        },
      });
    });

    return NextResponse.json(
      {
        url: blobResult.url,
        creditsUsed: estimate,
        creditsRemaining: (currentAmount || 0) - estimate,
        audioPromptUrl,
      },
      { status: 200 },
    );
  } catch (error) {
    const errorObj = {
      text,
      audioPromptUrl,
      errorData: error,
    };
    captureException({
      error: 'Voice cloning error',
      ...errorObj,
    });
    // Add this to see the actual validation errors
    if (error && typeof error === 'object' && 'body' in error) {
      console.error(
        'Validation error details:',
        JSON.stringify(error.body, null, 2),
      );
    } else {
      console.error(errorObj);
    }
    console.error('Voice cloning error:', error);
    if (Error.isError(error)) {
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
  event,
  text,
  locale,
  audioPromptUrl,
  predictionId,
  creditUsed,
  model,
}: {
  userId: string;
  event: string;
  text: string;
  locale: string;
  audioPromptUrl: string;
  predictionId?: string;
  creditUsed: number;
  model: string;
}) {
  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event,
    properties: {
      predictionId,
      model,
      text,
      locale,
      audioPromptUrl,
      credits_used: creditUsed,
    },
  });
  await posthog.shutdown();
}

const sanitizeFilename = (filename: string) => {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-zA-Z0-9.-]/g, '_'); // Replace special chars with underscore
};
