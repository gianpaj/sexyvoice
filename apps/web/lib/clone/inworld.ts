import { randomUUID } from 'node:crypto';

import { getAudioDuration } from '@/lib/audio';
import {
  convertToWav,
  isConversionSupported,
  needsConversion,
  trimWavBuffer,
} from '@/lib/audio-converter';
import { INWORLD_LANG_CONFIG } from '@/lib/clone/languages';

// ============================================================================
// Inworld TTS voice cloning
//
// Two non-streaming calls:
//   1. Clone:      POST https://api.inworld.ai/voices/v1/voices:clone
//      → mints a `voiceId` from the uploaded reference audio.
//   2. Synthesize: POST https://api.inworld.ai/tts/v1/voice
//      → returns base64-encoded MP3 (`audioContent`) spoken with that voice.
//
// Both calls authenticate with `Authorization: Basic <INWORLD_API_KEY>`, where
// INWORLD_API_KEY is the base64 Basic credential. Keep this server-side only.
// ============================================================================

const INWORLD_CLONE_URL = 'https://api.inworld.ai/voices/v1/voices:clone';
const INWORLD_SYNTHESIZE_URL = 'https://api.inworld.ai/tts/v1/voice';
const INWORLD_VOICES_URL = 'https://api.inworld.ai/voices/v1/voices';

export const INWORLD_MODEL_ID = 'inworld-tts-2';
export const INWORLD_OUTPUT_MIME_TYPE = 'audio/mpeg';

// Reference audio constraints (Inworld accepts 3–15s clips, ≤4MB, wav/mp3).
export const INWORLD_MIN_DURATION = 3;
export const INWORLD_MAX_DURATION = 15;

/**
 * Thrown when the Inworld API returns a non-2xx response. `status` is the HTTP
 * status from the failing call so callers can distinguish transient (5xx) from
 * client (4xx) failures.
 */
export class InworldError extends Error {
  status: number;
  transient: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'InworldError';
    this.status = status;
    this.transient = status >= 500;
  }
}

function getInworldAuthHeader(): string {
  const apiKey = process.env.INWORLD_API_KEY;

  if (!apiKey) {
    throw new Error('INWORLD_API_KEY is not configured');
  }

  return `Basic ${apiKey}`;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

interface CreateInworldVoiceArgs {
  description?: string;
  displayName: string;
  locale: string;
  referenceAudioBuffer: Buffer;
}

/**
 * Clones the reference audio into a persistent Inworld voice and returns its
 * `voiceId`. The voice stays in the Inworld workspace until deleted.
 */
export async function createInworldVoice({
  description,
  displayName,
  locale,
  referenceAudioBuffer,
}: CreateInworldVoiceArgs): Promise<{ voiceId: string }> {
  const langConfig = INWORLD_LANG_CONFIG[locale];
  if (!langConfig) {
    throw new Error(`Unsupported Inworld locale: ${locale}`);
  }

  const cloneResponse = await fetch(INWORLD_CLONE_URL, {
    method: 'POST',
    headers: {
      Authorization: getInworldAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description,
      displayName,
      langCode: langConfig.langCode,
      voiceSamples: [
        {
          audioData: referenceAudioBuffer.toString('base64'),
        },
      ],
    }),
  });

  if (!cloneResponse.ok) {
    throw new InworldError(
      `Inworld voice clone failed: ${await readErrorBody(cloneResponse)}`,
      cloneResponse.status,
    );
  }

  const cloneResult = (await cloneResponse.json()) as {
    voice?: { voiceId?: string };
  };
  const voiceId = cloneResult.voice?.voiceId;

  if (!voiceId) {
    throw new Error('Inworld voice clone response did not include a voiceId');
  }

  return { voiceId };
}

interface SynthesizeWithInworldArgs {
  locale: string;
  text: string;
  voiceId: string;
}

/**
 * Synthesizes `text` with an existing Inworld `voiceId`. Returns the MP3 buffer.
 */
export async function synthesizeWithInworld({
  locale,
  text,
  voiceId,
}: SynthesizeWithInworldArgs): Promise<{
  buffer: Buffer;
  mimeType: string;
  modelUsed: string;
  requestId: string;
}> {
  const langConfig = INWORLD_LANG_CONFIG[locale];
  if (!langConfig) {
    throw new Error(`Unsupported Inworld locale: ${locale}`);
  }

  const synthesizeResponse = await fetch(INWORLD_SYNTHESIZE_URL, {
    method: 'POST',
    headers: {
      Authorization: getInworldAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voiceId,
      modelId: INWORLD_MODEL_ID,
      deliveryMode: 'CREATIVE',
      language: langConfig.language,
      audioConfig: {
        speakingRate: 1,
      },
    }),
  });

  if (!synthesizeResponse.ok) {
    throw new InworldError(
      `Inworld synthesis failed: ${await readErrorBody(synthesizeResponse)}`,
      synthesizeResponse.status,
    );
  }

  const synthesizeResult = (await synthesizeResponse.json()) as {
    audioContent?: string;
  };
  const audioContent = synthesizeResult.audioContent;

  if (!audioContent) {
    throw new Error('Inworld synthesis response did not include audio data');
  }

  const buffer = Buffer.from(audioContent, 'base64');
  if (buffer.length === 0) {
    throw new Error('Inworld synthesis response returned empty audio data');
  }

  return {
    buffer,
    mimeType: INWORLD_OUTPUT_MIME_TYPE,
    modelUsed: INWORLD_MODEL_ID,
    requestId: randomUUID(),
  };
}

interface CloneVoiceWithInworldArgs {
  displayName: string;
  locale: string;
  referenceAudioBuffer: Buffer;
  text: string;
  userId: string;
}

/**
 * Convenience wrapper: create a voice from the reference audio, then synthesize
 * `text` with it. Returns both the generated audio and the new `voiceId` so the
 * caller can persist the voice for reuse.
 */
export async function cloneVoiceWithInworld({
  displayName,
  locale,
  referenceAudioBuffer,
  userId,
  text,
}: CloneVoiceWithInworldArgs): Promise<{
  buffer: Buffer;
  mimeType: string;
  modelUsed: string;
  requestId: string;
  voiceId: string;
}> {
  const { voiceId } = await createInworldVoice({
    displayName,
    locale,
    referenceAudioBuffer,
    description: userId,
  });

  const synthesized = await synthesizeWithInworld({ locale, text, voiceId });

  return { ...synthesized, voiceId };
}

/**
 * Normalizes an uploaded reference clip for Inworld: converts to WAV when
 * needed and trims to Inworld's max duration. Returns the processed buffer and
 * its measured duration (caller validates the minimum). Throws on unsupported
 * formats / decode failures. Shared by the clone-voice route and the call-page
 * clone-only endpoint.
 */
export async function prepareInworldReferenceAudio({
  buffer,
  filename,
  mimeType,
}: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<{ buffer: Buffer; duration: number | null }> {
  let processed = buffer;
  let workingMime = mimeType;

  if (needsConversion(mimeType)) {
    if (!isConversionSupported(mimeType, filename)) {
      throw new Error(
        `Unsupported audio format for Inworld voice: ${mimeType}`,
      );
    }
    const wav = await convertToWav(buffer, mimeType, filename);
    if (wav) {
      processed = wav as Buffer;
      workingMime = 'audio/wav';
    }
  }

  let duration = await getAudioDuration(processed, workingMime);

  if (duration !== null && duration > INWORLD_MAX_DURATION) {
    const trimmed = trimWavBuffer(processed, INWORLD_MAX_DURATION);
    if (trimmed && trimmed !== processed) {
      processed = trimmed;
      duration =
        (await getAudioDuration(processed, 'audio/wav')) ??
        INWORLD_MAX_DURATION;
    }
  }

  return { buffer: processed, duration };
}

/**
 * Deletes a voice from the Inworld workspace. A 404 is treated as success
 * (already deleted); other non-2xx responses throw an InworldError.
 */
export async function deleteInworldVoice(voiceId: string): Promise<void> {
  const response = await fetch(
    `${INWORLD_VOICES_URL}/${encodeURIComponent(voiceId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: getInworldAuthHeader(),
      },
    },
  );

  if (response.ok || response.status === 404) {
    return;
  }

  throw new InworldError(
    `Inworld voice delete failed: ${await readErrorBody(response)}`,
    response.status,
  );
}
