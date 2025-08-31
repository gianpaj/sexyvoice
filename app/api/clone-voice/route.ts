import { fal } from '@fal-ai/client';
import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { del, head, put } from '@vercel/blob';
import { after, NextResponse } from 'next/server';

import { APIError, APIErrorResponse } from '@/lib/error-ts';
import PostHogClient from '@/lib/posthog';
import {
  getCredits,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCredits } from '@/lib/ai';

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
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_DURATION = 5; // seconds
const MAX_DURATION = 5 * 60; // 5 minutes

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

async function getAudioDuration(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<number | null> {
  try {
    // @ts-ignore
    const mm = await import('music-metadata');
    const metadata = await mm.parseBuffer(fileBuffer, mimeType);
    return metadata.format.duration ?? null;
  } catch (_e) {
    return null;
  }
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

    text = typeof textValue === 'string' ? textValue : '';
    audioFile = file instanceof File ? file : null;

    // Text-to-speech generation mode
    if (!text || !audioFile) {
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
      !audioFile.type.startsWith('audio/') ||
      !ALLOWED_TYPES.includes(audioFile.type)
    ) {
      return APIErrorResponse(
        'Invalid file type. Only MP3, OGG, M4A, or WAV allowed.',
        400,
      );
    }

    if (audioFile.size > MAX_SIZE) {
      return APIErrorResponse('File too large. Max 10MB allowed.', 400);
    }

    // Read file buffer and validate duration
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const duration = await getAudioDuration(buffer, audioFile.type);
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

    // const MODEL = 'speech-02-turbo';
    // const input = {
    //   model: MODEL,
    //   accuracy: 0.7,
    //   voice_file: blobResult.url,
    //   need_noise_reduction: false,
    //   need_volume_normalization: false,
    // };

    // $3.00 per output
    // const output = await replicate.run('minimax/voice-cloning', { input });

    // Store voice profile in database
    // const { error } = await supabase.from('voices').insert([
    //   {
    //     name: voiceName,
    //     language,
    //     is_public: false,
    //     is_nsfw: false,
    //     type: 'cloned',
    //     model: `minimax/voice-cloning_${MODEL}`,
    //     user_id: user.id,
    //     voice_url: blobResult.url,
    //   },
    // ]);

    // if (error) {
    //   Sentry.captureException({
    //     error: 'Failed to save voice profile',
    //     errorData: error,
    //   });
    //   return APIErrorResponse('Failed to save voice profile', 500);
    // }

    // await sendPosthogEvent({
    //   userId: user.id,
    //   event: 'voice-cloned',
    //   text: '',
    //   audioPromptUrl: blobResult.url,
    //   creditUsed: 0, // Voice cloning doesn't use credits, it's a one-time setup
    //   model: `minimax/voice-cloning_${MODEL}`,
    // });

    // return NextResponse.json(
    //   {
    //     message: 'Voice cloned successfully',
    //     voiceUrl: blobResult.url,
    //     replicateOutput: output,
    //   },
    //   { status: 200 },
    // );

    // Handle text-to-speech generation mode
    const currentAmount = await getCredits(user.id);

    // Estimate credits for voice cloning generation (higher cost than regular)
    const estimate = await estimateCredits(text, 'clone');

    if (currentAmount < estimate) {
      Sentry.captureMessage('Insufficient credits', {
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
    const blobUrl = `clone-voice-input/${user.id}-${audioFile.name}`;

    try {
      const existingAudio = await head(blobUrl);

      if (existingAudio) {
        audioPromptUrl = existingAudio.url;
      }
    } catch (_e) {
      // Upload audio file to Vercel blob for TTS generation
      const audioBlob = await put(blobUrl, buffer, {
        access: 'public',
        contentType: audioFile.type,
      });
      audioPromptUrl = audioBlob.url;
    }

    // Generate hash for caching
    const hash = await generateHash(text, audioFile.name);
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
        audioPromptUrl,
        creditUsed: 0,
        model: 'chatterbox-tts',
      });
      return NextResponse.json({ url: cachedResult }, { status: 200 });
    }

    // Generate TTS with cloned voice using fal.ai
    const input = {
      text,
      // TODO: accept these parameters
      cfg_weight: 0.5,
      temperature: 0.8,
      exaggeration: 0.5,
      audio_url: audioPromptUrl,
    };

    const result = await fal.subscribe('fal-ai/chatterbox/text-to-speech', {
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
    const requestId = result.requestId;

    // Fetch the audio file from the URL and upload to blob storage
    const audioResponse = await fetch(falData.audio.url);
    const audioBuffer = await audioResponse.arrayBuffer();

    const blobResult = await put(filename, audioBuffer, {
      access: 'public',
      contentType: 'audio/mpeg',
      allowOverwrite: true,
    });

    await redis.set(filename, blobResult.url);

    // Background tasks
    after(async () => {
      await reduceCredits({ userId: user.id, currentAmount, amount: estimate });

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: blobResult.url,
        model: 'chatterbox-tts',
        predictionId: requestId,
        isPublic: false,
        voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
        duration: duration.toString(),
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
        event: 'clone-voice',
        predictionId: requestId,
        text,
        audioPromptUrl,
        creditUsed: estimate,
        model: 'chatterbox-tts',
      });

      // delete the audio file uploaded
      await del(blobUrl);
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
  event,
  text,
  audioPromptUrl,
  predictionId,
  creditUsed,
  model,
}: {
  userId: string;
  event: string;
  text: string;
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
      predictionId: predictionId,
      model,
      text,
      audioPromptUrl,
      credits_used: creditUsed,
    },
  });
  await posthog.shutdown();
}
