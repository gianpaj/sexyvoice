import { randomUUID } from 'node:crypto';

import {
  clientMessageSchema,
  MAX_FRAME_BYTES,
  OUTPUT_SAMPLE_RATE,
  type ServerEvent,
} from './protocol';
import type { TranscriptionSession } from './upstream/session';

export interface ProbeMessage {
  content: string;
  role: 'user' | 'assistant';
}
export type ReplyChunk =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: unknown };
export type SpeechChunk =
  | { type: 'audio'; audio: string }
  | { type: 'usage'; characters: number };
export interface ProbeProviders {
  reply: (
    history: ProbeMessage[],
    controller: AbortController,
  ) => AsyncIterable<ReplyChunk>;
  speech: (text: string, signal: AbortSignal) => AsyncIterable<SpeechChunk>;
  stt: (
    sampleRate: number,
    signal: AbortSignal,
  ) => Promise<TranscriptionSession>;
}

export function createVoiceProbe(options: {
  providers: ProbeProviders;
  emit: (event: ServerEvent) => void;
  emitAudio: (
    event: Extract<ServerEvent, { type: 'audio' }>,
    signal: AbortSignal,
  ) => Promise<void>;
  close: (code: number, reason: string) => void;
  leaseMs: number;
}) {
  const { emit, providers } = options;
  const history: ProbeMessage[] = [];
  const acceptedIds = new Set<string>();
  let disposed = false;
  let callActive = false;
  let muted = false;
  let sampleRate = 48_000;
  let stt: TranscriptionSession | undefined;
  let sttController: AbortController | undefined;
  let turn: { id: string; controller: AbortController } | undefined;
  let lastTextAt = 0;
  let audioWindowAt = Date.now();
  let audioWindowBytes = 0;
  let frameWindowAt = Date.now();
  let frameWindowCount = 0;

  const send = (event: ServerEvent) => {
    if (!disposed) emit(event);
  };
  const state = () => {
    if (!callActive) {
      send({ type: 'state', state: 'idle' });
      return;
    }
    if (muted) {
      send({ type: 'state', state: 'muted' });
      return;
    }
    send({ type: 'state', state: stt ? 'listening' : 'connecting' });
  };
  function interrupt() {
    const previous = turn;
    turn = undefined;
    previous?.controller.abort();
    if (previous)
      send({ type: 'text.end', id: previous.id, status: 'interrupted' });
  }
  function stopStt() {
    sttController?.abort();
    sttController = undefined;
    const previous = stt;
    stt = undefined;
    // Abort closes the socket immediately; close() may also flush provider state.
    previous?.close().catch(() => undefined);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(lease);
    interrupt();
    stopStt();
  }
  function fail() {
    send({ type: 'error', code: 'provider' });
    dispose();
    options.close(1011, 'Provider failed');
  }

  async function runTurn(id: string, text: string, voice: boolean) {
    if (disposed || turn) return;
    if (history.length >= 40) {
      send({ type: 'error', code: 'limit' });
      return;
    }
    const current = { id, controller: new AbortController() };
    turn = current;
    acceptedIds.add(id);
    history.push({ role: 'user', content: text });
    send({ type: 'text.start', id });
    send({ type: 'state', state: 'thinking' });
    let answer = '';
    try {
      for await (const chunk of providers.reply(
        [...history],
        current.controller,
      )) {
        if (disposed || current !== turn) return;
        if (chunk.type === 'usage')
          send({ type: 'usage', modality: 'llm', usage: chunk.usage });
        else {
          if (answer.length + chunk.text.length > 4000)
            throw new Error('Output limit exceeded');
          answer += chunk.text;
          send({ type: 'text.delta', id, text: chunk.text });
        }
      }
      if (disposed || current !== turn) return;
      // The first probe measures whole-reply synthesis. Phrase pipelining follows
      // after transport and cancellation are measured on the preview deployment.
      if (voice && answer.trim()) {
        for await (const chunk of providers.speech(
          answer,
          current.controller.signal,
        )) {
          if (disposed || current !== turn) return;
          if (chunk.type === 'audio')
            await options.emitAudio(
              {
                type: 'audio',
                id,
                audio: chunk.audio,
                sampleRate: OUTPUT_SAMPLE_RATE,
              },
              current.controller.signal,
            );
          else
            send({
              type: 'usage',
              modality: 'tts',
              usage: { characters: chunk.characters },
            });
        }
      }
      if (disposed || current !== turn) return;
      history.push({ role: 'assistant', content: answer });
      turn = undefined;
      send({ type: 'text.end', id, status: 'completed' });
      state();
    } catch {
      if (disposed || current !== turn) return;
      turn = undefined;
      current.controller.abort();
      send({ type: 'text.end', id, status: 'failed' });
      fail();
    }
  }

  async function startStt() {
    stopStt();
    const controller = new AbortController();
    sttController = controller;
    let pending = '';
    let session: TranscriptionSession;
    try {
      session = await providers.stt(sampleRate, controller.signal);
    } catch (error) {
      if (controller.signal.aborted || disposed) return;
      throw error;
    }
    if (controller.signal.aborted || disposed) {
      await session.close();
      return;
    }
    stt = session;
    state();
    for await (const event of session) {
      if (disposed || controller.signal.aborted || muted || !callActive) return;
      if (event.type === 'error') throw new Error('Transcription failed');
      if (event.type === 'interim') {
        if (event.text.trim()) interrupt();
        send({ type: 'transcript', text: event.text, final: false });
      }
      if (event.type === 'final') {
        pending = `${pending} ${event.text}`.trim();
        if ([...pending].length > 2000)
          throw new Error('Transcript limit exceeded');
      }
      if (event.type === 'turn-end' && pending) {
        interrupt();
        const text = pending;
        pending = '';
        send({ type: 'transcript', text, final: true });
        runTurn(randomUUID(), text, true).catch(fail);
      }
    }
    if (!(controller.signal.aborted || disposed))
      throw new Error('Transcription disconnected');
  }

  function receive(data: string | Uint8Array) {
    if (disposed) return;
    if (Date.now() - frameWindowAt >= 1000) {
      frameWindowAt = Date.now();
      frameWindowCount = 0;
    }
    if (
      ++frameWindowCount > 100 ||
      (typeof data === 'string'
        ? new TextEncoder().encode(data).byteLength
        : data.byteLength) > MAX_FRAME_BYTES
    ) {
      send({ type: 'error', code: 'limit' });
      dispose();
      options.close(1008, 'Frame limit');
      return;
    }
    if (typeof data !== 'string') {
      if (!(callActive && !muted && stt)) return;
      if (data.byteLength % 2) {
        send({ type: 'error', code: 'invalid_message' });
        return;
      }
      if (Date.now() - audioWindowAt >= 1000) {
        audioWindowAt = Date.now();
        audioWindowBytes = 0;
      }
      audioWindowBytes += data.byteLength;
      if (audioWindowBytes > sampleRate * 2 * 2) {
        send({ type: 'error', code: 'limit' });
        return;
      }
      try {
        stt.send(data);
      } catch {
        fail();
      }
      return;
    }
    let parsed: ReturnType<typeof clientMessageSchema.safeParse>;
    try {
      parsed = clientMessageSchema.safeParse(JSON.parse(data));
    } catch {
      send({ type: 'error', code: 'invalid_message' });
      return;
    }
    if (!parsed.success) {
      send({ type: 'error', code: 'invalid_message' });
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case 'ping':
        send({ type: 'pong', id: message.id });
        break;
      case 'text':
        if (acceptedIds.has(message.id)) return;
        if (turn || callActive) {
          send({ type: 'error', code: 'busy' });
          return;
        }
        if (Date.now() - lastTextAt < 1000) {
          send({ type: 'error', code: 'limit' });
          return;
        }
        lastTextAt = Date.now();
        runTurn(message.id, message.text, false).catch(fail);
        break;
      case 'call.start':
        if (turn || callActive) {
          send({ type: 'error', code: 'busy' });
          return;
        }
        callActive = true;
        muted = false;
        sampleRate = message.sampleRate;
        state();
        startStt().catch(() => {
          if (callActive && !disposed) fail();
        });
        break;
      case 'call.stop':
        callActive = false;
        interrupt();
        stopStt();
        state();
        break;
      case 'mute':
        if (!callActive) return;
        if (muted === message.muted) return;
        muted = message.muted;
        if (muted) stopStt();
        else
          startStt().catch(() => {
            if (callActive && !disposed) fail();
          });
        state();
        break;
      case 'interrupt':
        interrupt();
        state();
        break;
      default:
        break;
    }
  }
  const lease = setTimeout(() => {
    send({ type: 'rotate', recoverable: false });
    dispose();
    options.close(1012, 'Probe lease expired');
  }, options.leaseMs);
  send({
    type: 'ready',
    leaseMs: options.leaseMs,
    durability: 'connection-only',
  });
  return { receive, dispose };
}
