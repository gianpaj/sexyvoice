import { randomUUID } from 'node:crypto';
import { Mistral } from '@mistralai/mistralai';
import { captureException, logger, setUser } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { parseBuffer } from 'music-metadata';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { generateHash } from '@/lib/audio';
import {
  convertToWav,
  isConversionSupported,
  needsConversion,
} from '@/lib/audio-converter';
import {
  type CloneProvider,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from '@/lib/clone/constants';
import PostHogClient from '@/lib/posthog';
import { uploadFileToR2 } from '@/lib/storage/upload';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import {
  getCredits,
  hasUserPaid,
  insertUsageEvent,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCredits, getDollarCost } from '@/lib/utils';

const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  // Opus files (.opus) use audio/opus or audio/x-opus MIME types
  'audio/opus',
  'audio/x-opus',
  // Microphone recordings often come in as WebM/Opus and may be reported as audio/webm or video/webm
  'audio/webm',
  'video/webm',
  'application/octet-stream',
];

const MAX_LENGTH_EN = 500;
const MAX_LENGTH_MULTILANGUAGE = 300;
const FALLBACK_MIN_DURATION = 10;
const FALLBACK_MAX_DURATION = 5 * 60; // 5 minutes
const VOXTRAL_MIN_DURATION = 3;
const VOXTRAL_MAX_DURATION = 25;

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

export const maxDuration = 600; // seconds - fluid compute is enabled

// ============================================================================
// Types
// ============================================================================

interface ReplicateOutput {
  blob: () => Promise<Blob>;
  url: () => string;
}

interface ReplicateError {
  error?: string;
}

type ReplicateResponse = ReplicateOutput | ReplicateError;

interface CloneProviderConstraints {
  maxDurationSeconds: number;
  minDurationSeconds: number;
}

interface FormInput {
  file: File;
  locale: string;
  text: string;
}

class RouteError extends Error {
  code?: string;
  status: number;
  serverMessage: string;

  constructor(serverMessage: string, status: number, code?: string) {
    super(`${serverMessage} (${status})`);
    this.name = 'RouteError';
    this.status = status;
    this.serverMessage = serverMessage;
    this.code = code;
  }
}

let mistralClient: Mistral | null = null;

function getMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

  if (!mistralClient) {
    mistralClient = new Mistral({ apiKey });
  }

  return mistralClient;
}

function createRouteError(
  serverMessage: string,
  status: number,
  code?: string,
): RouteError {
  return new RouteError(serverMessage, status, code);
}

function routeErrorResponse(
  serverMessage: string,
  status: number,
  code?: string,
) {
  return NextResponse.json(
    {
      error: `${serverMessage} (${status})`,
      serverMessage,
      status,
      code,
    },
    { status },
  );
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

async function generateBufferHash(buffer: Buffer): Promise<string> {
  // Use a content-based SHA-256 hash so identical uploads produce the same cache key.
  // This allows R2/Redis entries to be reused deterministically instead of depending on timestamps.
  // `new Uint8Array(buffer)` creates a view over the existing Buffer data here, so it does not
  // materially increase memory usage beyond hashing the already in-memory upload.
  const data = new Uint8Array(buffer);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getAudioDuration(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<number | null> {
  try {
    const metadata = await parseBuffer(
      fileBuffer,
      {
        mimeType,
        size: fileBuffer.length,
      },
      {
        duration: true,
      },
    );

    return metadata.format.duration ?? null;
  } catch (_e) {
    return null;
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

function isVoxtralCloneLocale(locale: string): boolean {
  return VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale);
}

function resolveCloneProvider(locale: string): CloneProvider {
  return isVoxtralCloneLocale(locale) ? 'mistral' : 'replicate';
}

function getCloneProviderConstraints(
  provider: CloneProvider,
): CloneProviderConstraints {
  if (provider === 'mistral') {
    return {
      minDurationSeconds: VOXTRAL_MIN_DURATION,
      maxDurationSeconds: VOXTRAL_MAX_DURATION,
    };
  }

  return {
    minDurationSeconds: FALLBACK_MIN_DURATION,
    maxDurationSeconds: FALLBACK_MAX_DURATION,
  };
}

function validateContentType(contentType: string): void {
  if (!contentType.startsWith('multipart/form-data')) {
    throw createRouteError('Content-Type must be multipart/form-data', 400);
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
    throw createRouteError(
      'Missing required parameters: text and audio file',
      400,
    );
  }

  if (!localeStr) {
    throw createRouteError('Missing required parameter: locale', 400);
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
    throw createRouteError(errorMessage, 400);
  }
}

function validateFileType(file: File): string {
  const normalizedFileType = file.type.split(';')[0]?.trim().toLowerCase();

  if (!ALLOWED_TYPES.includes(normalizedFileType)) {
    throw createRouteError(
      'Invalid file type. Only MP3, OGG, Opus, M4A, WAV, or WebM allowed.',
      400,
    );
  }

  return normalizedFileType;
}

function validateFileSize(file: File): void {
  if (file.size > CLONING_FILE_MAX_SIZE) {
    const maxMb = (CLONING_FILE_MAX_SIZE / 1024 / 1024).toFixed(1);
    const errorMessage = `File too large. Max ${maxMb}MB allowed.`;
    throw createRouteError(errorMessage, 413);
  }
}

function validateAudioDuration(
  duration: number | null,
  provider: CloneProvider,
): void {
  if (duration === null) {
    throw createRouteError(
      'Could not determine audio duration.',
      400,
      'clone_audio_duration_unknown',
    );
  }

  const constraints = getCloneProviderConstraints(provider);

  if (duration < constraints.minDurationSeconds) {
    const errorMessage =
      provider === 'mistral'
        ? `Reference audio must be at least ${constraints.minDurationSeconds} seconds for voice cloning.`
        : `Audio must be at least ${constraints.minDurationSeconds} seconds.`;

    throw createRouteError(
      errorMessage,
      400,
      provider === 'mistral'
        ? 'clone_audio_duration_invalid_voxtral'
        : 'clone_audio_duration_invalid_fallback',
    );
  }
}

/**
 * Trim a WAV buffer to a maximum duration.
 * Walks the RIFF chunk list to locate the 'data' chunk, so it handles
 * non-canonical WAVs that contain extra chunks (LIST, fact, JUNK, etc.)
 * between the 'fmt ' and 'data' chunks.
 * Returns the original buffer unchanged if it cannot be parsed or trimming
 * is not needed.
 */
function trimWavAudio(wavBuffer: Buffer, maxDurationSeconds: number): Buffer {
  if (wavBuffer.length < 12) return wavBuffer;
  if (wavBuffer.toString('ascii', 0, 4) !== 'RIFF') return wavBuffer;
  if (wavBuffer.toString('ascii', 8, 12) !== 'WAVE') return wavBuffer;

  let sampleRate = 0;
  let numChannels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  // Walk RIFF sub-chunks starting after the 12-byte RIFF/WAVE header
  let offset = 12;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ' && chunkSize >= 16 && offset + 8 + chunkSize <= wavBuffer.length) {
      numChannels = wavBuffer.readUInt16LE(offset + 10);
      sampleRate = wavBuffer.readUInt32LE(offset + 12);
      bitsPerSample = wavBuffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    // Advance; RIFF chunks are padded to even byte boundaries
    offset += 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0);
  }

  if (dataOffset === -1 || sampleRate <= 0 || numChannels <= 0 || bitsPerSample <= 0) {
    return wavBuffer;
  }

  // Guard against a dataSize that exceeds the actual buffer contents
  const safeDataSize = Math.min(dataSize, wavBuffer.length - dataOffset);

  const blockAlign = numChannels * (bitsPerSample / 8);
  const bytesPerSecond = sampleRate * blockAlign;
  const maxAudioBytes =
    Math.floor((maxDurationSeconds * bytesPerSecond) / blockAlign) * blockAlign;

  if (safeDataSize <= maxAudioBytes) return wavBuffer;

  const newDataSize = maxAudioBytes;

  // Preserve every byte up to (and including) the data chunk header, then
  // append only the trimmed samples.  This keeps any extra chunks intact.
  const newBuffer = Buffer.alloc(dataOffset + newDataSize);

  wavBuffer.copy(newBuffer, 0, 0, dataOffset);

  // Patch RIFF chunk size (offset 4) and data chunk size (4 bytes before dataOffset)
  newBuffer.writeUInt32LE(newBuffer.length - 8, 4);
  newBuffer.writeUInt32LE(newDataSize, dataOffset - 4);

  wavBuffer.copy(newBuffer, dataOffset, dataOffset, dataOffset + newDataSize);

  return newBuffer;
}

function validateLocale(locale: string): void {
  const localeConfig = SUPPORTED_LOCALE_CODES.find((l) => l.code === locale);
  if (!localeConfig) {
    throw createRouteError(
      `Unsupported language for voice cloning: ${locale}. Supported languages are: ${SUPPORTED_LOCALE_CODES.map((l) => l.code).join(', ')}`,
      400,
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
    throw createRouteError(
      `Insufficient credits. You need ${estimate} credits to generate this audio`,
      402,
    );
  }

  return { currentAmount, estimate };
}

// ============================================================================
// Audio Processing Functions
// ============================================================================

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: large
async function processAudioFile(
  file: File,
  locale: string,
  userId: string,
): Promise<{
  audioHash: string;
  buffer: Buffer;
  duration: number | null;
  mimeType: string;
}> {
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

  const provider = resolveCloneProvider(locale);

  // Convert to WAV for providers that need normalized reference audio
  if (provider === 'mistral' && needsConversion(normalizedMimeType)) {
    if (!(isMicAudio || isConversionSupported(normalizedMimeType, file.name))) {
      throw createRouteError(
        'Unsupported audio format for non-English voice cloning. Please use MP3, OGG/OPUS, WEBM, or WAV.',
        400,
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
      const errorMessage = Error.isError(conversionError)
        ? conversionError.message
        : 'Unknown error';
      const errorStack = Error.isError(conversionError)
        ? conversionError.stack
        : undefined;

      console.error('Audio conversion failed:', {
        error: errorMessage,
        stack: errorStack,
        normalizedMimeType,
        isMicAudio,
        locale,
        filename: file.name,
        bufferSize: buffer.length,
      });

      captureException(conversionError, {
        user: { id: userId },
        extra: { locale, mimeType: file.type, filename: file.name },
      });

      const errorMsg =
        normalizedMimeType === 'audio/webm' ||
        normalizedMimeType === 'video/webm'
          ? 'WebM audio must be converted to WAV on the client before uploading. Please try recording again.'
          : 'Failed to convert audio format to WAV. Uploaded file must be MP3, OGG, Opus, or WAV';

      throw createRouteError(errorMsg, 500);
    }
  }

  const duration = await getAudioDuration(processedBuffer, processedMimeType);

  // Auto-trim audio to the provider's maximum duration instead of rejecting it.
  const constraints = getCloneProviderConstraints(provider);
  if (duration !== null && duration > constraints.maxDurationSeconds) {
    if (processedMimeType === 'audio/wav') {
      processedBuffer = trimWavAudio(
        processedBuffer,
        constraints.maxDurationSeconds,
      ) as Buffer<ArrayBuffer>;
    } else if (isConversionSupported(processedMimeType)) {
      // For non-WAV formats we can decode (MP3, OGG/Opus/Vorbis), convert to
      // WAV first so we can trim by sample count.  WebM throws inside
      // convertToWav on the server — the catch below leaves those files
      // untrimmed (Replicate's 5-minute window is generous enough in practice).
      try {
        const wavBuffer = await convertToWav(
          processedBuffer,
          processedMimeType,
        );
        if (wavBuffer) {
          processedBuffer = trimWavAudio(
            wavBuffer as Buffer<ArrayBuffer>,
            constraints.maxDurationSeconds,
          ) as Buffer<ArrayBuffer>;
          processedMimeType = 'audio/wav';
        }
      } catch {
        // Conversion unsupported or failed — leave the buffer untrimmed.
      }
    }
  }

  const audioHash = await generateBufferHash(processedBuffer);

  return {
    audioHash,
    buffer: processedBuffer,
    mimeType: processedMimeType,
    // Preserve null so validateAudioDuration can catch unknown-duration uploads.
    // When trimmed, cap at maxDurationSeconds since we know the file was shortened.
    duration:
      duration !== null
        ? Math.min(duration, constraints.maxDurationSeconds)
        : null,
  };
}

// ============================================================================
// Voice Generation Functions
// ============================================================================

async function generateVoiceWithMistral(
  text: string,
  referenceAudioBuffer: Buffer,
): Promise<{ buffer: Buffer; modelUsed: string; requestId: string }> {
  const model = 'voxtral-mini-tts-2603';
  const client = getMistralClient();

  const response = await client.audio.speech.complete({
    model,
    input: text,
    refAudio: referenceAudioBuffer.toString('base64'),
    responseFormat: 'wav',
  });

  const audioData = response.audioData;
  if (!audioData) {
    throw new Error('Mistral Voxtral response did not include audio data');
  }

  let buffer: Buffer;
  if (typeof audioData === 'string') {
    buffer = Buffer.from(audioData, 'base64');
  } else {
    buffer = Buffer.from(audioData);
  }

  if (buffer.length === 0) {
    throw new Error('Mistral Voxtral response returned empty audio data');
  }

  const riffHeader = buffer.subarray(0, 4).toString('ascii');
  const waveHeader = buffer.subarray(8, 12).toString('ascii');

  if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
    throw new Error('Mistral Voxtral response did not return a valid WAV file');
  }

  return {
    buffer,
    modelUsed: model,
    requestId: randomUUID(),
  };
}

async function generateVoiceWithReplicate(
  text: string,
  locale: string,
  audioReferenceUrl: string,
): Promise<{ blob: Blob; modelUsed: string; requestId: string }> {
  const localeConfig = SUPPORTED_LOCALE_CODES.find((l) => l.code === locale);
  if (!localeConfig) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  let language = locale;
  if (locale === 'en-multi') {
    language = 'en';
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
    language,
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
      language,
      audioReferenceUrl,
      model,
      errorData: output.error,
    };
    const error = new Error(
      output.error || 'Voice cloning failed, please try again',
      {
        cause: 'REPLICATE_ERROR',
      },
    );
    captureException(error, {
      extra: errorObj,
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
  provider: CloneProvider,
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
      generatedAudioUrl: audioFileData.url,
      model: audioFileData.modelUsed,
      errorData: audioFileDBResult.error,
    };
    const error = new Error(
      audioFileDBResult.error.message || 'Failed to insert audio file row',
    );
    captureException(error, {
      user: { id: userId },
      extra: errorObj,
    });
    console.error(errorObj);
  }

  // Insert usage event for tracking voice cloning (non-blocking)
  await insertUsageEvent({
    userId,
    sourceType: 'voice_cloning',
    sourceId: audioFileDBResult.data?.id,
    unit: 'operation',
    quantity: 1,
    creditsUsed: estimate,
    dollarAmount: getDollarCost(provider, estimate, audioFileData.text),
    metadata: {
      provider,
      model: audioFileData.modelUsed,
      locale: audioFileData.locale,
      textPreview: audioFileData.text.slice(0, 100),
      textLength: audioFileData.text.length,
      audioDuration: audioFileData.duration,
      referenceAudioFileMimeType: audioFileData.referenceAudioFileMimeType,
      requestId: audioFileData.requestId,
      userHasPaid,
    },
  });
  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'clone-voice',
    properties: {
      provider,
      predictionId: audioFileData.requestId,
      textPreview: audioFileData.text.slice(0, 100),
      model: audioFileData.modelUsed,
      audioDuration: audioFileData.duration,
      text: audioFileData.text,
      locale: audioFileData.locale,
      generatedAudioUrl: audioFileData.url,
      credits_used: estimate,
      userHasPaid,
    },
  });
  await posthog.shutdown();
}

// ============================================================================
// Main Route Handler
// ============================================================================

export async function POST(request: Request) {
  let text = '';
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
      return routeErrorResponse('User not found', 401);
    }

    setUser({
      id: user.id,
      email: user.email,
    });

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
    const provider = resolveCloneProvider(locale);

    const processedAudio = await processAudioFile(
      referenceAudioFile,
      locale,
      user.id,
    );
    validateAudioDuration(processedAudio.duration, provider);
    duration = processedAudio.duration;

    // Generate deterministic cache key by audio hash, text, and locale
    const hash = await generateHash(
      `${locale}-${provider}-${text}-${processedAudio.audioHash}`,
    );
    const userHasPaid = await hasUserPaid(user.id);
    const basePath = userHasPaid ? 'cloned-audio' : 'cloned-audio-free';
    const path = `${basePath}/${locale}-${provider}-${hash}`;
    const filename = `${path}.wav`;

    const cachedOutputUrl = await redis.get<string>(filename);
    if (cachedOutputUrl) {
      return NextResponse.json(
        {
          url: cachedOutputUrl,
          creditsUsed: 0,
          creditsRemaining: currentAmount || 0,
        },
        { status: 200 },
      );
    }

    // Generate voice
    let outputUrl: string;
    let requestId: string;

    if (provider === 'mistral') {
      const result = await generateVoiceWithMistral(
        text,
        processedAudio.buffer,
      );

      outputUrl = await uploadGeneratedAudio(
        result.buffer,
        filename,
        'audio/wav',
      );

      modelUsed = result.modelUsed;
      requestId = result.requestId;
    } else {
      const referenceAudioFilename = sanitizeFilename(referenceAudioFile.name);
      const processedFilename =
        processedAudio.mimeType === 'audio/wav' &&
        !referenceAudioFilename.endsWith('.wav')
          ? `${referenceAudioFilename.replace(/\.[^/.]+$/, '')}.wav`
          : referenceAudioFilename;

      const blobUrl = `clone-voice-input/${user.id}-${processedAudio.audioHash}-${processedFilename}`;

      const referenceAudioUrl = await uploadFileToR2(
        blobUrl,
        processedAudio.buffer,
        processedAudio.mimeType,
      );

      const result = await generateVoiceWithReplicate(
        text,
        locale,
        referenceAudioUrl,
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
      await runBackgroundTasks(user.id, estimate, provider, {
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
    if (error instanceof RouteError) {
      return routeErrorResponse(error.serverMessage, error.status, error.code);
    }

    const errorObj = {
      text,
      locale,
      errorData: error,
    };
    captureException(error, {
      extra: errorObj,
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
      { error: Error.isError(error) ? error.message : String(error) },
      { status: 500 },
    );
  }
}
