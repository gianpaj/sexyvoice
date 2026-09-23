import {
  type GenerateContentConfig,
  type GenerateContentResponse,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';

import { convertToWav } from '@/lib/audio';
import { buildGeminiVoiceConfig } from '@/lib/tts/gemini-prompt';

export function buildGeminiTtsConfig({
  voiceName,
  model,
  seed,
  temperature,
  abortSignal,
}: {
  voiceName: string;
  model?: string;
  seed?: number;
  temperature?: number;
  abortSignal: AbortSignal;
}): GenerateContentConfig {
  return {
    abortSignal,
    responseModalities: ['AUDIO'],
    ...(seed === undefined ? {} : { seed }),
    ...(temperature === undefined ? {} : { temperature }),
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
    speechConfig: {
      voiceConfig: buildGeminiVoiceConfig(voiceName, model),
    },
  };
}

export function extractGeminiInlineAudio(
  response: GenerateContentResponse,
): { data: string; mimeType: string } | null {
  const part = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!(part?.data && part?.mimeType)) return null;
  return { data: part.data, mimeType: part.mimeType };
}

export function extractGeminiStreamAudioChunk(
  chunk: GenerateContentResponse,
): { data: string; mimeType: string } | null {
  const part = chunk?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) return null;
  return {
    data: part.data,
    mimeType: part.mimeType ?? 'audio/L16;rate=24000',
  };
}

/** Concatenate streamed PCM base64 chunks and wrap in a WAV header. */
export function convertAudioChunksToWav(
  chunks: string[],
  mimeType: string,
): Buffer {
  if (chunks.length === 0) throw new Error('No audio chunks to convert');

  const pcmBuffers = chunks.map((c) => Buffer.from(c, 'base64'));
  const pcmBuffer = Buffer.concat(pcmBuffers);

  // If the first chunk already carries a RIFF/WAV header, do not double-wrap.
  if (pcmBuffer.slice(0, 4).toString('ascii') === 'RIFF') {
    return pcmBuffer;
  }

  return convertToWav(pcmBuffer.toString('base64'), mimeType);
}

export function createSseEvent(
  event: 'audio' | 'done' | 'error',
  payload: Record<string, unknown>,
): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export const SSE_HEADERS = {
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'Content-Type': 'text/event-stream',
  'X-Accel-Buffering': 'no',
} as const;
