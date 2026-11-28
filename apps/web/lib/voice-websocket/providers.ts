import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { streamReply } from '@sexyvoice/voice-chat/reply';

import type { ProbeProviders, SpeechChunk } from './probe';
import { OUTPUT_SAMPLE_RATE } from './protocol';
import { grokLiveTranscription } from './upstream/grok';
import { transcriptionSession } from './upstream/session';

async function* ndjson(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const next = await reader.read();
      pending += next.done
        ? decoder.decode()
        : decoder.decode(next.value, { stream: true });
      if (pending.length > 2_000_000)
        throw new Error('Inworld response limit exceeded');
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (line.trim()) yield JSON.parse(line) as unknown;
        newline = pending.indexOf('\n');
      }
      if (next.done) {
        if (pending.trim()) yield JSON.parse(pending) as unknown;
        return;
      }
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

interface InworldMessage {
  error?: unknown;
  result?: {
    audioContent?: string;
    usage?: { processedCharactersCount?: number };
  };
}

export async function* streamInworldSpeech(
  text: string,
  signal: AbortSignal,
  apiKey = process.env.INWORLD_API_KEY,
): AsyncGenerator<SpeechChunk> {
  signal.throwIfAborted();
  if (!(apiKey && text.trim()) || text.length > 4000)
    throw new Error('Invalid Inworld request');
  const response = await fetch('https://api.inworld.ai/tts/v1/voice:stream', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      text,
      voiceId: 'Ashley',
      modelId: 'inworld-tts-2',
      audioConfig: {
        audioEncoding: 'PCM',
        sampleRateHertz: OUTPUT_SAMPLE_RATE,
      },
    }),
  });
  if (!(response.ok && response.body))
    throw new Error('Inworld request failed');
  let totalBytes = 0;
  for await (const value of ndjson(response.body)) {
    signal.throwIfAborted();
    if (!value || typeof value !== 'object')
      throw new Error('Invalid Inworld response');
    const message = value as InworldMessage;
    if (message.error) throw new Error('Inworld synthesis failed');
    const characters = message.result?.usage?.processedCharactersCount;
    if (characters !== undefined) {
      if (!(Number.isSafeInteger(characters) && characters >= 0))
        throw new Error('Invalid Inworld usage');
      yield { type: 'usage', characters };
    }
    const audio = message.result?.audioContent;
    if (audio) {
      if (
        typeof audio !== 'string' ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          audio,
        )
      )
        throw new Error('Invalid Inworld audio');
      const bytes = Buffer.from(audio, 'base64');
      totalBytes += bytes.length;
      if (bytes.length % 2 || totalBytes > 6_000_000)
        throw new Error('Invalid Inworld PCM length');
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        yield {
          type: 'audio',
          audio: bytes.subarray(offset, offset + 8192).toString('base64'),
        };
      }
    }
  }
  if (totalBytes === 0) throw new Error('Inworld returned no audio');
}

export function createProbeProviders(): ProbeProviders {
  const threadId = randomUUID();
  return {
    async *reply(messages, abortController) {
      const stream = streamReply({
        threadId,
        abortController,
        messages,
        systemPrompts: [
          'You are a conversational test assistant. Reply briefly, in one or two sentences.',
        ],
      });
      for await (const event of stream) {
        if (event.type === 'text') yield event;
        if (event.type === 'finished' && event.usage)
          yield { type: 'usage', usage: event.usage };
      }
    },
    speech: streamInworldSpeech,
    stt: (sampleRate, signal) =>
      transcriptionSession({
        adapter: grokLiveTranscription('grok-voice-transcribe-2.0'),
        audio: { encoding: 'linear16', sampleRate, channels: 1 },
        abortSignal: signal,
        modelOptions: { endpointing: 500 },
        language: 'en',
      }),
  };
}
