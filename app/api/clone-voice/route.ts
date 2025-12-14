import { fal } from '@fal-ai/client';
import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { generateHash } from '@/lib/audio';
import { APIError, APIErrorResponse } from '@/lib/error-ts';
import PostHogClient from '@/lib/posthog';
import { uploadFileToR2 } from '@/lib/storage/upload';
import {
  getCredits,
  hasUserPaid,
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
const MAX_LENGTH = 500;
const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5MB
const MIN_DURATION = 10; // seconds
const MAX_DURATION = 5 * 60; // 5 minutes

interface ReplicateOutput {
  url: () => string;
  blob: () => Promise<Blob>;
}
interface ReplicateError {
  error?: string;
}
type ReplicateResponse = ReplicateOutput | ReplicateError;

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
  let audioReferenceUrl: string | null = '';
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

    if (text.length > MAX_LENGTH) {
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

    const existingAudio = await redis.get<string>(blobUrl);

    if (existingAudio) {
      audioReferenceUrl = existingAudio;
    } else {
      audioReferenceUrl = await uploadFileToR2(
        blobUrl,
        buffer,
        userAudioFile.type, // it should be converted to Wav by the client
      );
      await redis.set(blobUrl, audioReferenceUrl);
    }

    const hash = await generateHash(
      `${locale}-${text}-${blobUrl}-${Date.now()}`,
    );
    const abortController = new AbortController();

    // Determine path based on user's paid status
    const userHasPaid = await hasUserPaid(user.id);
    const basePath = userHasPaid ? 'cloned-audio' : 'cloned-audio-free';
    const path = `${basePath}/${hash}`;
    const filename = `${path}.wav`;

    request.signal.addEventListener('abort', () => {
      console.log('request aborted. hash:', hash);
      abortController.abort();
    });

    let model: `${string}/${string}`;
    let input: Record<string, unknown>;
    let url: string;
    let requestId: string;

    if (locale === 'en') {
      // Use chatterbox for English
      model = 'fal-ai/chatterbox/text-to-speech';
      input = {
        seed: 0,
        text,
        cfg_weight: 0.5,
        temperature: 0.8,
        exaggeration: 0.5,
        audio_prompt: audioReferenceUrl,
      };

      const result = await fal.subscribe(model, {
        input,
        logs: false,
        // onQueueUpdate: (update) => {
        //   if (update.status === 'IN_PROGRESS') {
        //     update.logs?.map((log) => log.message).forEach(console.log);
        //   }
        // },
        abortSignal: request.signal,
      });

      const falData = result.data as {
        audio: {
          url: string;
          content_type: string;
          file_name: string;
          file_size: number;
        };
      };

      const audioResponse = await fetch(falData.audio.url);
      const audioBuffer = await audioResponse.arrayBuffer();

      url = await uploadFileToR2(
        filename,
        Buffer.from(audioBuffer),
        'audio/mpeg',
      );

      await redis.set(filename, url);

      requestId = result.requestId;
      modelUsed = model;
    } else {
      const replicate = new Replicate();
      const onProgress = (prediction: Prediction) => {
        replicateResponse = prediction;
      };
      // Use chatterbox-multilingual for non-English
      model =
        'resemble-ai/chatterbox-multilingual:9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c';
      input = {
        seed: 0,
        text,
        language: SUPPORTED_LOCALE_CODES.find((l) => l.value === locale)?.code,
        cfg_weight: 0.5,
        temperature: 0.8,
        exaggeration: 0.5,
        reference_audio: audioReferenceUrl,
      };

      const output = (await replicate.run(
        model,
        {
          input,
          // signal
        },
        onProgress,
      )) as ReplicateResponse;

      if (typeof output === 'object' && 'error' in output) {
        const errorObj = {
          text,
          locale,
          audioReferenceUrl,
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

      modelUsed = model.split(':')[0]; // Get model name without version hash
      requestId = replicateResponse?.id || 'unknown';
      const audioBuffer = await (output as ReplicateOutput).blob();

      url = await uploadFileToR2(filename, audioBuffer, 'audio/wav');
    }

    // Background tasks
    after(async () => {
      await reduceCredits({ userId: user.id, amount: estimate });

      const userHasPaid = await hasUserPaid(user.id);

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url,
        model: modelUsed,
        predictionId: requestId,
        isPublic: false,
        voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
        duration: duration.toFixed(3),
        credits_used: estimate,
        usage: {
          locale,
          userHasPaid,
        },
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          audioReferenceUrl,
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
        audioReferenceUrl: audioReferenceUrl || '',
        creditUsed: estimate,
        model: modelUsed,
      });
    });

    return NextResponse.json(
      {
        url,
        creditsUsed: estimate,
        creditsRemaining: (currentAmount || 0) - estimate,
      },
      { status: 200 },
    );
  } catch (error) {
    const errorObj = {
      text,
      audioReferenceUrl,
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
  audioReferenceUrl,
  predictionId,
  creditUsed,
  model,
}: {
  userId: string;
  event: string;
  text: string;
  locale: string;
  audioReferenceUrl: string;
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
      audioReferenceUrl,
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

const SUPPORTED_LOCALE_CODES = [
  { code: 'ar', value: 'arabic' },
  { code: 'da', value: 'danish' },
  { code: 'de', value: 'german' },
  { code: 'el', value: 'greek' },
  { code: 'en', value: 'english' },
  { code: 'en-multi', value: 'english' },
  { code: 'es', value: 'spanish' },
  { code: 'fi', value: 'finnish' },
  { code: 'fr', value: 'french' },
  { code: 'he', value: 'hebrew' },
  { code: 'hi', value: 'hindi' },
  { code: 'it', value: 'italian' },
  { code: 'ja', value: 'japanese' },
  { code: 'ko', value: 'korean' },
  { code: 'ms', value: 'malay' },
  { code: 'nl', value: 'dutch' },
  { code: 'no', value: 'norwegian' },
  { code: 'pl', value: 'polish' },
  { code: 'pt', value: 'portuguese' },
  { code: 'ru', value: 'russian' },
  { code: 'sv', value: 'swedish' },
  { code: 'sw', value: 'swahili' },
  { code: 'tr', value: 'turkish' },
  { code: 'zh', value: 'chinese' },
];
