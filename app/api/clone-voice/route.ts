import { fal } from '@fal-ai/client';
import { captureException, logger } from '@sentry/nextjs';
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

// Replicate multilinguage supports the following languages
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

export const maxDuration = 320; // seconds - fluid compute is enabled

// ============================================================================
// Types
// ============================================================================

interface ReplicateOutput {
  url: () => string;
  blob: () => Promise<Blob>;
}

interface ReplicateError {
  error?: string;
}

type ReplicateResponse = ReplicateOutput | ReplicateError;

interface FormInput {
  text: string;
  file: File;
  locale: string;
}

// ============================================================================
// Utilities
// ============================================================================

const redis = Redis.fromEnv();

const sanitizeFilename = (filename: string): string => {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-zA-Z0-9.-]/g, '_'); // Replace special chars with underscore
};

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

// ============================================================================
// Validation Functions
// ============================================================================

function validateContentType(contentType: string): void {
  if (!contentType.startsWith('multipart/form-data')) {
    throw new APIError(
      'Content-Type must be multipart/form-data',
      new Response('Content-Type must be multipart/form-data', {
        status: 400,
      }),
    );
  }
}

async function parseFormData(request: Request): Promise<FormInput> {
  const formData = await request.formData();

  const textValue = formData.get('text');
  const file = formData.get('file');
  const locale = formData.get('locale');

  const text = typeof textValue === 'string' ? textValue : '';
  const audioFile = file instanceof File ? file : null;
  const localeStr = typeof locale === 'string' ? locale : '';

  if (!(text && audioFile)) {
    throw new APIError(
      'Missing required parameters: text and audio file',
      new Response('Missing required parameters: text and audio file', {
        status: 400,
      }),
    );
  }

  if (!localeStr) {
    throw new APIError(
      'Missing required parameter: locale',
      new Response('Missing required parameter: locale', { status: 400 }),
    );
  }

  return { text, file: audioFile, locale: localeStr };
}

function validateTextLength(text: string, locale: string): void {
  const maxLength = locale === 'en' ? MAX_LENGTH_EN : MAX_LENGTH_MULTILANGUAGE;

  if (text.length > maxLength) {
    const errorMessage =
      locale === 'en'
        ? 'Text exceeds the maximum length of 500 characters'
        : `Text exceeds the maximum length of ${MAX_LENGTH_MULTILANGUAGE} characters for multilingual voice cloning`;
    throw new APIError(
      errorMessage,
      new Response(errorMessage, { status: 400 }),
    );
  }
}

function validateFileType(file: File): string {
  const normalizedFileType = file.type.split(';')[0]?.trim().toLowerCase();

  if (!ALLOWED_TYPES.includes(normalizedFileType)) {
    throw new APIError(
      'Invalid file type. Only MP3, OGG, M4A, or WAV allowed.',
      new Response('Invalid file type. Only MP3, OGG, M4A, or WAV allowed.', {
        status: 400,
      }),
    );
  }

  return normalizedFileType;
}

function validateFileSize(file: File): void {
  if (file.size > MAX_SIZE) {
    throw new APIError(
      'File too large. Max 4.5MB allowed.',
      new Response('File too large. Max 4.5MB allowed.', { status: 400 }),
    );
  }
}

function validateAudioDuration(duration: number | null): void {
  if (duration === null) {
    throw new APIError(
      'Could not determine audio duration.',
      new Response('Could not determine audio duration.', { status: 400 }),
    );
  }

  if (duration < MIN_DURATION || duration > MAX_DURATION) {
    throw new APIError(
      `Audio must be between ${MIN_DURATION} seconds and ${MAX_DURATION / 60} minutes.`,
      new Response(
        `Audio must be between ${MIN_DURATION} seconds and ${MAX_DURATION / 60} minutes.`,
        { status: 400 },
      ),
    );
  }
}

function validateLocale(locale: string): void {
  if (locale === 'en') {
    return; // English is always supported (uses fal.ai)
  }

  const localeConfig = SUPPORTED_LOCALE_CODES.find((l) => l.code === locale);
  if (!localeConfig) {
    throw new APIError(
      `Unsupported language for voice cloning: ${locale}. Supported languages are: ${SUPPORTED_LOCALE_CODES.map((l) => l.code).join(', ')}`,
      new Response(
        `Unsupported language for voice cloning: ${locale}. Supported languages are: ${SUPPORTED_LOCALE_CODES.map((l) => l.code).join(', ')}`,
        { status: 400 },
      ),
    );
  }
}

async function validateCredits(
  userId: string,
  text: string,
  userEmail?: string,
): Promise<{ currentAmount: number; estimate: number }> {
  const currentAmount = await getCredits(userId);
  const estimate = estimateCredits(text, 'clone');

  if (currentAmount < estimate) {
    logger.info('Insufficient credits', {
      user: { id: userId, email: userEmail },
      extra: { text, estimate, currentCreditsAmount: currentAmount },
    });
    throw new APIError(
      `Insufficient credits. You need ${estimate} credits to generate this audio`,
      new Response(
        `Insufficient credits. You need ${estimate} credits to generate this audio`,
        { status: 402 },
      ),
    );
  }

  return { currentAmount, estimate };
}

// ============================================================================
// Audio Processing Functions
// ============================================================================

async function processAudioFile(
  file: File,
  locale: string,
  userId: string,
): Promise<{ buffer: Buffer; mimeType: string; duration: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Normalize MIME type (microphone recordings may include codecs params)
  let normalizedMimeType = file.type.split(';')[0]?.trim().toLowerCase();
  let isMicAudio = false;

  // Detect microphone recordings
  const filenameLower = file.name.toLowerCase();
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

  let processedBuffer = buffer;
  let processedMimeType = normalizedMimeType;

  // Convert to WAV for non-English locales if needed
  if (locale !== 'en' && needsConversion(normalizedMimeType)) {
    if (!(isMicAudio || isConversionSupported(normalizedMimeType, file.name))) {
      throw new APIError(
        'Unsupported audio format for non-English voice cloning. Please use MP3, OGG/OPUS, WEBM, or WAV.',
        new Response(
          'Unsupported audio format for non-English voice cloning. Please use MP3, OGG/OPUS, WEBM, or WAV.',
          { status: 400 },
        ),
      );
    }

    try {
      const wavBuffer = await convertToWav(
        buffer,
        normalizedMimeType,
        file.name,
      );

      if (wavBuffer) {
        processedBuffer = wavBuffer as Buffer<ArrayBuffer>;
        processedMimeType = 'audio/wav';
        logger.info('Converted audio to WAV for non-English voice cloning', {
          user: { id: userId },
          extra: {
            originalMimeType: file.type,
            locale,
          },
        });
      }
    } catch (conversionError) {
      const errorMessage =
        conversionError instanceof Error
          ? conversionError.message
          : 'Unknown error';
      const errorStack =
        conversionError instanceof Error ? conversionError.stack : undefined;

      console.error('Audio conversion failed:', {
        error: errorMessage,
        stack: errorStack,
        normalizedMimeType,
        isMicAudio,
        locale,
        filename: file.name,
        bufferSize: buffer.length,
      });

      captureException({
        user: { id: userId },
        error: 'Audio conversion failed',
        errorData: errorMessage,
        errorStack,
        locale,
        mimeType: file.type,
        filename: file.name,
      });

      const errorMsg =
        normalizedMimeType === 'audio/webm'
          ? 'WebM audio must be converted to WAV on the client before uploading. Please try recording again.'
          : 'Failed to convert audio format to WAV. Uploaded file must be MP3, OGG, or WAV';

      throw new APIError(errorMsg, new Response(errorMsg, { status: 500 }));
    }
  }

  const duration = await getAudioDuration(processedBuffer, processedMimeType);
  validateAudioDuration(duration);

  return {
    buffer: processedBuffer,
    mimeType: processedMimeType,
    duration: duration as number,
  };
}

async function uploadReferenceAudio(
  file: File,
  processedBuffer: Buffer,
  processedMimeType: string,
  userId: string,
): Promise<{ url: string; blobUrl: string }> {
  const isMicAudio = file.name
    .toLowerCase()
    .startsWith('microphone-recording.');
  const referenceAudioFilename = sanitizeFilename(file.name);

  const processedFilename =
    processedMimeType === 'audio/wav' &&
    !referenceAudioFilename.endsWith('.wav')
      ? `${referenceAudioFilename.replace(/\.[^/.]+$/, '')}.wav`
      : referenceAudioFilename;

  const timestamp = isMicAudio ? `-${Date.now().toString()}` : '';
  const blobUrl = `clone-voice-input/${userId}${timestamp}-${processedFilename}`;

  // Check if already uploaded
  const existingAudio = await redis.get<string>(blobUrl);
  if (existingAudio) {
    return { url: existingAudio, blobUrl };
  }

  // Upload to R2
  const url = await uploadFileToR2(blobUrl, processedBuffer, processedMimeType);
  await redis.set(blobUrl, url);

  return { url, blobUrl };
}

// ============================================================================
// Voice Generation Functions
// ============================================================================

async function generateVoiceWithReplicate(
  text: string,
  locale: string,
  audioReferenceUrl: string,
): Promise<{ blob: Blob; modelUsed: string; requestId: string }> {
  const localeConfig = SUPPORTED_LOCALE_CODES.find((l) => l.code === locale);
  if (!localeConfig) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const replicate = new Replicate();
  let replicateResponse: Prediction | undefined;

  const onProgress = (prediction: Prediction) => {
    replicateResponse = prediction;
  };

  const model =
    'resemble-ai/chatterbox-multilingual:9cfba4c265e685f840612be835424f8c33bdee685d7466ece7684b0d9d4c0b1c' as `${string}/${string}`;
  const input = {
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
    { input },
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
    throw new Error(output.error || 'Voice cloning failed, please try again', {
      cause: 'REPLICATE_ERROR',
    });
  }

  const audioBlob = await (output as ReplicateOutput).blob();

  return {
    blob: audioBlob,
    modelUsed: model.split(':')[0],
    requestId: replicateResponse?.id || 'unknown',
  };
}

async function uploadGeneratedAudio(
  audioData: Buffer | Blob,
  filename: string,
  mimeType: string,
): Promise<string> {
  let buffer: Buffer;

  if (audioData instanceof Blob) {
    const arrayBuffer = await audioData.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    buffer = audioData;
  }

  const url = await uploadFileToR2(filename, buffer, mimeType);
  await redis.set(filename, url);

  return url;
}

// ============================================================================
// Background Tasks
// ============================================================================

async function runBackgroundTasks(
  userId: string,
  estimate: number,
  audioFileData: {
    filename: string;
    text: string;
    url: string;
    modelUsed: string;
    requestId: string;
    duration: number;
    locale: string;
    referenceAudioFileMimeType: string;
  },
): Promise<void> {
  await reduceCredits({ userId, amount: estimate });

  const userHasPaid = await hasUserPaid(userId);

  const audioFileDBResult = await saveAudioFile({
    userId,
    filename: audioFileData.filename,
    text: audioFileData.text,
    url: audioFileData.url,
    model: audioFileData.modelUsed,
    predictionId: audioFileData.requestId,
    isPublic: false,
    voiceId: '420c4014-7d6d-44ef-b87d-962a3124a170',
    duration: audioFileData.duration.toFixed(3),
    credits_used: estimate,
    usage: {
      locale: audioFileData.locale,
      userHasPaid,
      referenceAudioFileMimeType: audioFileData.referenceAudioFileMimeType,
    },
  });

  if (audioFileDBResult.error) {
    const errorObj = {
      text: audioFileData.text,
      audioReferenceUrl: audioFileData.url,
      model: 'chatterbox-tts',
      errorData: audioFileDBResult.error,
    };
    captureException({
      error: 'Failed to insert audio file row',
      ...errorObj,
    });
    console.error(errorObj);
  }

  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'clone-voice',
    properties: {
      predictionId: audioFileData.requestId,
      model: audioFileData.modelUsed,
      text: audioFileData.text,
      locale: audioFileData.locale,
      audioReferenceUrl: audioFileData.url,
      credits_used: estimate,
    },
  });
  await posthog.shutdown();
}

// ============================================================================
// Main Route Handler
// ============================================================================

export async function POST(request: Request) {
  let text = '';
  let audioReferenceUrl: string | null = '';
  let locale = '';
  let duration: number | null = null;
  let modelUsed = '';
  let referenceAudioFile: File | null = null;

  try {
    // Authentication
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return APIErrorResponse('User not found', 401);
    }

    // Parse and validate request
    const contentType = request.headers.get('content-type') || '';
    validateContentType(contentType);

    const formInput = await parseFormData(request);
    text = formInput.text;
    locale = formInput.locale;
    referenceAudioFile = formInput.file;

    // Validate inputs
    validateTextLength(text, locale);
    validateFileType(referenceAudioFile);
    validateFileSize(referenceAudioFile);
    validateLocale(locale);

    // Check credits
    const { currentAmount, estimate } = await validateCredits(
      user.id,
      text,
      user.email,
    );

    // Process audio file
    const processedAudio = await processAudioFile(
      referenceAudioFile,
      locale,
      user.id,
    );
    duration = processedAudio.duration;

    // Upload reference audio
    const { url: referenceUrl, blobUrl } = await uploadReferenceAudio(
      referenceAudioFile,
      processedAudio.buffer,
      processedAudio.mimeType,
      user.id,
    );
    audioReferenceUrl = referenceUrl;

    // Generate output filename
    const hash = await generateHash(
      `${locale}-${text}-${blobUrl}-${Date.now()}`,
    );
    const userHasPaid = await hasUserPaid(user.id);
    const basePath = userHasPaid ? 'cloned-audio' : 'cloned-audio-free';
    const path = `${basePath}/${hash}`;
    const filename = `${path}.wav`;

    // Generate voice
    let outputUrl: string;
    let requestId: string;

    if (locale === 'en') {
      // English: Use fal.ai
      // Download from fal.ai
      const model = 'fal-ai/chatterbox/text-to-speech' as `${string}/${string}`;
      const input = {
        seed: 0,
        text,
        cfg_weight: 0.5,
        temperature: 0.8,
        exaggeration: 0.5,
        audio_prompt: audioReferenceUrl,
      };

      const falResult = await fal.subscribe(model, {
        input,
        logs: false,
        abortSignal: request.signal,
      });

      const falData = falResult.data as {
        audio: {
          url: string;
          content_type: string;
          file_name: string;
          file_size: number;
        };
      };

      const audioResponse = await fetch(falData.audio.url);
      const audioBuffer = await audioResponse.arrayBuffer();

      outputUrl = await uploadGeneratedAudio(
        Buffer.from(audioBuffer),
        filename,
        'audio/mpeg',
      );

      modelUsed = model;
      requestId = falResult.requestId;
    } else {
      // Non-English: Use Replicate
      const result = await generateVoiceWithReplicate(
        text,
        locale,
        audioReferenceUrl,
      );

      outputUrl = await uploadGeneratedAudio(
        result.blob,
        filename,
        'audio/wav',
      );

      modelUsed = result.modelUsed;
      requestId = result.requestId;
    }

    // Background tasks
    after(async () => {
      await runBackgroundTasks(user.id, estimate, {
        filename,
        text,
        url: outputUrl,
        modelUsed,
        requestId,
        duration: duration as number,
        locale,
        referenceAudioFileMimeType: referenceAudioFile?.type || '',
      });
    });

    return NextResponse.json(
      {
        url: outputUrl,
        creditsUsed: estimate,
        creditsRemaining: (currentAmount || 0) - estimate,
      },
      { status: 200 },
    );
  } catch (error) {
    // Handle APIError with proper status code
    if (error instanceof APIError) {
      return NextResponse.json(
        {
          error: error.message,
          serverMessage: error.serverMessage,
          status: error.status,
        },
        { status: error.status },
      );
    }

    const errorObj = {
      text,
      audioReferenceUrl,
      errorData: error,
    };
    captureException({
      error: 'Voice cloning error',
      ...errorObj,
    });

    if (Error.isError(error) && 'body' in error) {
      console.error(
        'Validation error details:',
        JSON.stringify(error.body, null, 2),
      );
    } else {
      console.error(errorObj);
    }

    return NextResponse.json(
      { error: Error.isError(error) ? error.message : 'Failed to clone voice' },
      { status: 500 },
    );
  }
}
