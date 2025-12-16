import { fal } from '@fal-ai/client';
import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { generateHash } from '@/lib/audio';
import {
  convertToWav,
  isConversionSupported,
  needsConversion,
} from '@/lib/audio-converter';
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
  // Microphone recordings often come in as WebM/Opus (sometimes reported as octet-stream)
  'audio/webm',
  'application/octet-stream',
];
const MAX_LENGTH_EN = 500;
const MAX_LENGTH_MULTILANGUAGE = 300;
const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5MB
const MIN_DURATION = 10;
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
  let referenceAudioFile: File | null = null;
  let audioReferenceUrl: string | null = '';
  let locale = '';
  let replicateResponse: Prediction | undefined;
  let duration: number | null = -1;
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
    referenceAudioFile = file instanceof File ? file : null;

    // Text-to-speech generation mode
    if (!(text && referenceAudioFile)) {
      return APIErrorResponse(
        'Missing required parameters: text and audio file',
        400,
      );
    }

    // Validate locale parameter
    if (!locale) {
      return APIErrorResponse('Missing required parameter: locale', 400);
    }

    // Validate text length based on locale
    const maxLength =
      locale === 'en' ? MAX_LENGTH_EN : MAX_LENGTH_MULTILANGUAGE;
    if (text.length > maxLength) {
      const errorMessage =
        locale === 'en'
          ? 'Text exceeds the maximum length of 500 characters'
          : `Text exceeds the maximum length of ${MAX_LENGTH_MULTILANGUAGE} characters for multilingual voice cloning`;
      return NextResponse.json(
        new APIError(
          errorMessage,
          new Response(errorMessage, {
            status: 400,
          }),
        ),
        { status: 400 },
      );
    }

    // Normalize MIME type before validation (e.g. "audio/webm;codecs=opus" -> "audio/webm")
    const normalizedFileType = referenceAudioFile.type
      .split(';')[0]
      ?.trim()
      .toLowerCase();

    if (!ALLOWED_TYPES.includes(normalizedFileType)) {
      return APIErrorResponse(
        'Invalid file type. Only MP3, OGG, M4A, or WAV allowed.',
        400,
      );
    }

    if (referenceAudioFile.size > MAX_SIZE) {
      return APIErrorResponse('File too large. Max 4.5MB allowed.', 400);
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

    // Read file buffer and validate duration
    const arrayBuffer = await referenceAudioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Normalize MIME type (microphone recordings may include codecs params)
    // Example: "audio/webm;codecs=opus" -> "audio/webm"
    let normalizedMimeType = referenceAudioFile.type
      .split(';')[0]
      ?.trim()
      .toLowerCase();

    let isMicAudio = false;

    // Some browsers/devices send microphone recordings as application/octet-stream
    // even when the filename clearly indicates the real type.
    // Frontend converts WebM to WAV using client-side FFmpeg before sending
    // to avoid server-side FFmpeg WASM conversion issues (FFmpeg WASM can't load on server)
    const filenameLower = referenceAudioFile.name.toLowerCase();
    if (
      normalizedMimeType === 'application/octet-stream' ||
      filenameLower.startsWith('microphone-recording.')
    ) {
      isMicAudio = true;

      if (
        normalizedMimeType === 'application/octet-stream' &&
        !normalizedMimeType.includes('audio/')
      ) {
        normalizedMimeType = 'audio/ogg';
      }
    }

    // clean filename
    const referenceAudioFilename = sanitizeFilename(referenceAudioFile.name);
    // Add .wav extension if we converted
    const processedFilename =
      normalizedMimeType === 'audio/wav' &&
      !referenceAudioFilename.endsWith('.wav')
        ? `${referenceAudioFilename.replace(/\.[^/.]+$/, '')}.wav`
        : referenceAudioFilename;

    const timestamp = isMicAudio ? `-${Date.now().toString()}` : '';
    const blobUrl = `clone-voice-input/${user.id}${timestamp}-${processedFilename}`;

    const existingAudio = await redis.get<string>(blobUrl);

    if (existingAudio) {
      audioReferenceUrl = existingAudio;
    } else {
      // For non-English voice cloning, convert audio to WAV if needed
      // The Replicate chatterbox-multilingual model works better with WAV input
      let processedBuffer = buffer;
      let processedMimeType = normalizedMimeType;

      if (locale !== 'en' && needsConversion(normalizedMimeType)) {
        // Check if the format is supported for conversion
        if (
          !(
            isMicAudio ||
            isConversionSupported(normalizedMimeType, referenceAudioFile.name)
          )
        ) {
          return APIErrorResponse(
            'Unsupported audio format for non-English voice cloning. Please use MP3, OGG/OPUS, WEBM, or WAV.',
            400,
          );
        }

        try {
          const wavBuffer = await convertToWav(
            buffer,
            normalizedMimeType,
            referenceAudioFile.name,
          );

          if (wavBuffer) {
            processedBuffer = wavBuffer as Buffer<ArrayBuffer>;
            processedMimeType = 'audio/wav';
            logger.info(
              'Converted audio to WAV for non-English voice cloning',
              {
                user: { id: user.id },
                extra: {
                  originalMimeType: referenceAudioFile.type,
                  locale,
                },
              },
            );
          }
        } catch (conversionError) {
          const errorMessage =
            conversionError instanceof Error
              ? conversionError.message
              : 'Unknown error';
          const errorStack =
            conversionError instanceof Error
              ? conversionError.stack
              : undefined;
          console.error('Audio conversion failed:', {
            error: errorMessage,
            stack: errorStack,
            normalizedMimeType,
            isMicAudio,
            locale,
            filename: referenceAudioFile.name,
            bufferSize: buffer.length,
          });
          captureException({
            user: { id: user.id },
            error: 'Audio conversion failed',
            errorData: errorMessage,
            errorStack,
            locale,
            mimeType: referenceAudioFile.type,
            filename: referenceAudioFile.name,
          });
          // Provide specific error message for WebM
          const errorMsg =
            normalizedMimeType === 'audio/webm'
              ? 'WebM audio must be converted to WAV on the client before uploading. Please try recording again.'
              : 'Failed to convert audio format to WAV. Uploaded file must be MP3, OGG, or WAV';

          return NextResponse.json(
            {
              error: errorMsg,
            },
            { status: 500 },
          );
        }
      }

      duration = await getAudioDuration(processedBuffer, processedMimeType);
      if (duration === null) {
        return APIErrorResponse('Could not determine audio duration.', 400);
      }

      if (duration < MIN_DURATION || duration > MAX_DURATION) {
        return APIErrorResponse(
          `Audio must be between ${MIN_DURATION} seconds and ${MAX_DURATION / 60} minutes.`,
          400,
        );
      }
      audioReferenceUrl = await uploadFileToR2(
        blobUrl,
        processedBuffer,
        processedMimeType,
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
      // Use fal.ai for English
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
      // Validate that locale is supported for Replicate model
      const localeConfig = SUPPORTED_LOCALE_CODES.find(
        (l) => l.code === locale,
      );
      if (!localeConfig) {
        return APIErrorResponse(
          `Unsupported language for voice cloning: ${locale}. Supported languages are: ${SUPPORTED_LOCALE_CODES.map((l) => l.code).join(', ')}`,
          400,
        );
      }

      const replicate = new Replicate();
      const onProgress = (prediction: Prediction) => {
        replicateResponse = prediction;
      };
      // Use resemble.ai chatterbox-multilingual for non-English
      model =
        'resemble-ai/chatterbox-multilingual:9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c';
      input = {
        seed: 0,
        text,
        language: localeConfig.code,
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

      // Replicate returns a Blob. Convert to a Buffer before uploading to R2.
      const audioBlob = await (output as ReplicateOutput).blob();
      const audioArrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = Buffer.from(audioArrayBuffer);

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
        duration: duration?.toFixed(3) || '-1',
        credits_used: estimate,
        usage: {
          locale,
          userHasPaid,
          referenceAudioFileMimeType: referenceAudioFile?.type || '',
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

// replicate multilinguage supports the following languages
// https://replicate.com/resemble-ai/chatterbox-multilingual/api/schema
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
