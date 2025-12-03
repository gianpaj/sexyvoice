import { fal } from '@fal-ai/client';
import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { head, type PutBlobResult, put } from '@vercel/blob';
import { after, NextResponse } from 'next/server';

import { APIError, APIErrorResponse } from '@/lib/error-ts';
import { inngest } from '@/lib/inngest/client';
import PostHogClient from '@/lib/posthog';
import {
  getCredits,
  getVoiceIdByName,
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

interface DeepInfraInferenceStatus {
  cost?: number;
  runtime_ms?: number;
  status?: string;
  tokens_generated?: number;
  tokens_input?: number;
}

export async function POST(request: Request) {
  let text = '';
  let userAudioFile: File | null = null;
  let audioPromptUrl = '';
  let stream = false;
  let voice = '';
  let model = '';

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

    const textValue = formData.get('text');
    const file = formData.get('file');
    const voiceValue = formData.get('voice');
    stream = Boolean(formData.get('stream') === 'true');

    text = typeof textValue === 'string' ? textValue : '';
    voice = typeof voiceValue === 'string' ? voiceValue : '';
    userAudioFile = file instanceof File ? file : null;

    if (!(text && userAudioFile && voice)) {
      return APIErrorResponse(
        'Missing required parameters: text, voice, or audio file',
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

    const voiceObj = await getVoiceIdByName(voice);

    if (!voiceObj) {
      captureException({ error: 'Voice not found', voice, text });
      return NextResponse.json({ error: 'Voice not found' }, { status: 404 });
    }

    model = voiceObj.model;

    const provider = voiceObj.provider;
    const shouldStream = provider === 'deepinfra' && stream;

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
    //   captureException({
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
    // TODO: add voice
    const blobUrl = `clone-voice-input/${user.id}-${userAudioFilename}`;

    try {
      // TODO: hash also the audio based on the duration
      const existingAudio = await head(blobUrl);

      if (existingAudio) {
        audioPromptUrl = existingAudio.url;
      }
    } catch (_e) {
      // TODO: upload to R2 temp bucket
      // Upload audio file to Vercel blob for TTS generation
      const audioBlob = await put(blobUrl, buffer, {
        access: 'public',
        contentType: userAudioFile.type,
      });
      audioPromptUrl = audioBlob.url;
    }

    let inferenceRequestId: string | undefined;
    let blobResult: PutBlobResult | null = null;

    // Generate hash for caching
    const hash = await generateHash(text, blobUrl);
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

    if (!['fal.ai', 'deepinfra'].includes(provider)) {
      return NextResponse.json(
        {
          error: 'Invalid provider for selected voice',
          provider,
        },
        { status: 400 },
      );
    }

    if (provider === 'fal.ai') {
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
      inferenceRequestId = result.requestId;

      // Fetch the audio file from the URL and upload to blob storage
      const audioResponse = await fetch(falData.audio.url);
      const audioBuffer = await audioResponse.arrayBuffer();

      blobResult = await put(filename, audioBuffer, {
        access: 'public',
        contentType: 'audio/mpeg',
        allowOverwrite: true,
      });
    } else if (provider === 'deepinfra') {
      const deepInfraToken = process.env.DEEPINFRA_TOKEN;

      if (!deepInfraToken) {
        throw new Error('DEEPINFRA_TOKEN is not configured', {
          cause: 'DEEPINFRA_TOKEN_MISSING',
        });
      }

      const deepInfraResponse = await fetch(
        `https://api.deepinfra.com/v1/inference/${voiceObj.model}`,
        {
          method: 'POST',
          headers: {
            Authorization: `bearer ${deepInfraToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: text,
            voice,
            response_format: 'wav',
          }),
          signal: abortController.signal,
        },
      );

      if (!deepInfraResponse.ok) {
        const errorText = await deepInfraResponse.text();
        logger.error('DeepInfra voice generation failed', {
          status: deepInfraResponse.status,
          statusText: deepInfraResponse.statusText,
          errorText,
        });
        throw new Error('Voice generation failed, please try again', {
          cause: 'DEEPINFRA_ERROR',
        });
      }

      const deepInfraResult = await deepInfraResponse.json();
      const outputFormat = deepInfraResult.output_format || 'wav';
      inferenceRequestId = deepInfraResult.request_id;
      // inferenceStatus = deepInfraResult.inference_status;
      const audioData: string | Uint8Array | undefined =
        deepInfraResult.audio || deepInfraResult.output?.audio;

      if (!audioData) {
        logger.error('DeepInfra response missing audio data', {
          deepInfraResult,
        });
        throw new Error('Voice generation failed, please try again', {
          cause: 'DEEPINFRA_AUDIO_MISSING',
        });
      }

      const audioBuffer =
        typeof audioData === 'string'
          ? Buffer.from(audioData, 'base64')
          : Buffer.from(audioData);

      blobResult = await put(filename, audioBuffer, {
        access: 'public',
        contentType: `audio/${outputFormat}`,
        allowOverwrite: true,
      });
    }

    if (!shouldStream && blobResult?.url) {
      await redis.set(filename, blobResult.url);
    }

    // Background tasks
    after(async () => {
      await reduceCredits({ userId: user.id, amount: estimate });

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: blobResult?.url!,
        model,
        predictionId: inferenceRequestId,
        isPublic: false,
        voiceId: voiceObj.id,
        duration: duration.toString(),
        credits_used: estimate,
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          audioPromptUrl,
          model,
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
        predictionId: inferenceRequestId,
        text,
        audioPromptUrl,
        creditUsed: estimate,
        model,
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
        url: blobResult?.url,
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
      predictionId,
      model,
      text,
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
