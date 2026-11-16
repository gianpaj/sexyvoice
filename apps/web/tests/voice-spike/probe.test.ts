import { describe, expect, it, vi } from 'vitest';

import { createVoiceProbe, type ProbeProviders } from '@/lib/voice-spike/probe';
import {
  clientMessageSchema,
  isSpikeAllowed,
  type ServerEvent,
} from '@/lib/voice-spike/protocol';

function setup() {
  const events: Record<string, unknown>[] = [];
  const send = vi.fn();
  const closeStt = vi.fn().mockResolvedValue(undefined);
  const providers: ProbeProviders = {
    async *reply(messages, controller) {
      expect(controller.signal.aborted).toBe(false);
      yield { type: 'text', text: `Reply ${messages.length}` };
    },
    async *speech() {
      yield { type: 'audio', audio: 'AAA=' };
    },
    stt: vi.fn(async (_rate, signal) => ({
      send,
      close: closeStt,
      async *[Symbol.asyncIterator]() {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      },
    })),
  };
  const close = vi.fn();
  const emitAudio = vi.fn(
    async (
      event: Extract<ServerEvent, { type: 'audio' }>,
      _signal: AbortSignal,
    ) => {
      events.push(event);
    },
  );
  const probe = createVoiceProbe({
    close,
    emitAudio,
    emit: (event) => {
      events.push(event);
    },
    providers,
    leaseMs: 60_000,
  });
  return { close, closeStt, emitAudio, events, probe, providers, send };
}

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('voice probe boundaries', () => {
  it('requires an explicit test user and blocks production', () => {
    expect(isSpikeAllowed('u1', 'u1,u2', 'preview', 'production')).toBe(true);
    expect(isSpikeAllowed('u3', 'u1,u2', 'preview', 'production')).toBe(false);
    expect(isSpikeAllowed('u1', 'u1', 'production', 'production')).toBe(false);
    expect(isSpikeAllowed('u1', '', undefined, 'development')).toBe(false);
    expect(isSpikeAllowed('u1', 'u1', 'unexpected', 'development')).toBe(false);
    expect(isSpikeAllowed('u1', 'u1', undefined, 'production')).toBe(false);
  });

  it('rejects oversized text, unsupported audio rates and extra identity fields', () => {
    expect(
      clientMessageSchema.safeParse({
        type: 'text',
        id: '1',
        text: 'a'.repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: 'call.start', sampleRate: 96_000 })
        .success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: 'ping', id: '1', userId: 'u1' })
        .success,
    ).toBe(false);
  });

  it('streams text without opening STT or TTS and deduplicates request IDs', async () => {
    const { probe, events, providers } = setup();
    const speech = vi.spyOn(providers, 'speech');
    probe.receive(JSON.stringify({ type: 'text', id: 'one', text: 'hello' }));
    await settle();
    probe.receive(JSON.stringify({ type: 'text', id: 'one', text: 'hello' }));
    await settle();
    expect(events.filter((e) => e.type === 'text.delta')).toHaveLength(1);
    expect(events.find((e) => e.type === 'state')).toEqual({
      type: 'state',
      state: 'thinking',
    });
    expect(providers.stt).not.toHaveBeenCalled();
    expect(speech).not.toHaveBeenCalled();
    probe.dispose();
  });

  it('gates audio on active call and mute, including events during STT setup', async () => {
    const { probe, send, closeStt, providers } = setup();
    probe.receive(new Uint8Array(20));
    expect(send).not.toHaveBeenCalled();
    probe.receive(JSON.stringify({ type: 'call.start', sampleRate: 48_000 }));
    await settle();
    probe.receive(new Uint8Array(20));
    expect(send).toHaveBeenCalledTimes(1);
    probe.receive(JSON.stringify({ type: 'mute', muted: true }));
    probe.receive(new Uint8Array(20));
    expect(send).toHaveBeenCalledTimes(1);
    expect(closeStt).toHaveBeenCalled();
    probe.receive(JSON.stringify({ type: 'mute', muted: false }));
    await settle();
    expect(providers.stt).toHaveBeenCalledTimes(2);
    probe.receive(JSON.stringify({ type: 'call.stop' }));
    probe.receive(new Uint8Array(20));
    expect(send).toHaveBeenCalledTimes(1);
    probe.dispose();
  });

  it('keeps context when the call ends and text resumes', async () => {
    const { probe, providers, events } = setup();
    probe.receive(
      JSON.stringify({ type: 'text', id: '1', text: 'remember this' }),
    );
    await settle();
    probe.receive(JSON.stringify({ type: 'call.start', sampleRate: 48_000 }));
    await settle();
    probe.receive(JSON.stringify({ type: 'call.stop' }));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1001);
    probe.receive(JSON.stringify({ type: 'text', id: '2', text: 'continue' }));
    await settle();
    expect(
      events.filter((e) => e.type === 'text.delta').map((e) => e.text),
    ).toEqual(['Reply 1', 'Reply 3']);
    expect(providers.stt).toHaveBeenCalledOnce();
    probe.dispose();
    vi.restoreAllMocks();
  });

  it('aborts a pending provider request on expiry and reports rotation without replay claims', () => {
    vi.useFakeTimers();
    const { probe, events, close } = setup();
    vi.advanceTimersByTime(60_000);
    expect(events).toContainEqual({ type: 'rotate', recoverable: false });
    expect(close).toHaveBeenCalledWith(1012, 'Probe lease expired');
    probe.dispose();
    vi.useRealTimers();
  });
});

describe('voice probe concurrent provider lifecycle', () => {
  it('runs the speech → LLM → Inworld path and carries its messages into text mode', async () => {
    const { probe, providers, events } = setup();
    const transcript = new TransformStream<
      import('@/lib/voice-spike/upstream/adapter').LiveTranscriptionEvent
    >();
    const writer = transcript.writable.getWriter();
    const closeStt = vi.fn(async () => {
      await writer.close();
    });
    vi.mocked(providers.stt).mockResolvedValue({
      send: vi.fn(),
      close: closeStt,
      [Symbol.asyncIterator]: () => transcript.readable[Symbol.asyncIterator](),
    });
    const reply = vi.spyOn(providers, 'reply');
    const speech = vi.spyOn(providers, 'speech');
    probe.receive(JSON.stringify({ type: 'call.start', sampleRate: 48_000 }));
    await settle();
    await writer.write({ type: 'final', text: 'My name is Alex' });
    await writer.write({ type: 'turn-end' });
    await settle();
    expect(speech).toHaveBeenCalledWith('Reply 1', expect.any(AbortSignal));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'audio',
        audio: 'AAA=',
        sampleRate: 24_000,
      }),
    );
    probe.receive(JSON.stringify({ type: 'call.stop' }));
    probe.receive(
      JSON.stringify({
        type: 'text',
        id: 'after-call',
        text: 'What is my name?',
      }),
    );
    await settle();
    expect(reply.mock.calls[1][0]).toEqual([
      { role: 'user', content: 'My name is Alex' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'What is my name?' },
    ]);
    probe.dispose();
  });

  it('pauses provider audio while transport is busy and aborts that wait on interruption', async () => {
    const { probe, providers, emitAudio, events } = setup();
    const transcript = new TransformStream<
      import('@/lib/voice-spike/upstream/adapter').LiveTranscriptionEvent
    >();
    const writer = transcript.writable.getWriter();
    vi.mocked(providers.stt).mockResolvedValue({
      send: vi.fn(),
      close: async () => {
        await writer.close();
      },
      [Symbol.asyncIterator]: () => transcript.readable[Symbol.asyncIterator](),
    });
    let chunksPulled = 0;
    providers.speech = async function* () {
      for (let i = 0; i < 10; i++) {
        chunksPulled++;
        yield { type: 'audio', audio: 'AAA=' };
      }
    };
    let signal: AbortSignal | undefined;
    emitAudio.mockImplementation((_event, current) => {
      signal = current;
      return new Promise((_resolve, reject) => {
        current.addEventListener('abort', () => reject(current.reason), {
          once: true,
        });
      });
    });
    probe.receive(JSON.stringify({ type: 'call.start', sampleRate: 48_000 }));
    await settle();
    await writer.write({ type: 'final', text: 'hello' });
    await writer.write({ type: 'turn-end' });
    await settle();
    expect(chunksPulled).toBe(1);
    probe.receive(JSON.stringify({ type: 'interrupt' }));
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(chunksPulled).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'text.end', status: 'interrupted' }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'error', code: 'provider' }),
    );
    probe.dispose();
  });

  it('aborts generation immediately and discards text arriving after interruption', async () => {
    const { probe, providers, events } = setup();
    let controller: AbortController | undefined;
    let release: (() => void) | undefined;
    providers.reply = async function* (_history, current) {
      controller = current;
      yield { type: 'text', text: 'First' };
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      yield { type: 'text', text: 'Stale' };
    };
    probe.receive(JSON.stringify({ type: 'text', id: 'one', text: 'hello' }));
    await settle();
    probe.receive(JSON.stringify({ type: 'interrupt' }));
    expect(controller?.signal.aborted).toBe(true);
    release?.();
    await settle();
    expect(
      events.filter((e) => e.type === 'text.delta').map((e) => e.text),
    ).toEqual(['First']);
    expect(events).toContainEqual({
      type: 'text.end',
      id: 'one',
      status: 'interrupted',
    });
    expect(events).not.toContainEqual({
      type: 'text.end',
      id: 'one',
      status: 'completed',
    });
    const reply = vi.fn<ProbeProviders['reply']>(async function* () {
      yield { type: 'text', text: 'Next reply' };
    });
    providers.reply = reply;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1001);
    probe.receive(
      JSON.stringify({ type: 'text', id: 'two', text: 'continue' }),
    );
    await settle();
    expect(reply.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'First', status: 'interrupted' },
      { role: 'user', content: 'continue' },
    ]);
    probe.dispose();
    vi.restoreAllMocks();
  });

  it('closes a late STT connection after mute instead of forwarding queued audio', async () => {
    const { probe, providers, send, closeStt, close, events } = setup();
    let finish:
      | ((
          value: import('@/lib/voice-spike/upstream/session').TranscriptionSession,
        ) => void)
      | undefined;
    vi.mocked(providers.stt).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    probe.receive(JSON.stringify({ type: 'call.start', sampleRate: 48_000 }));
    expect(events).toContainEqual({ type: 'state', state: 'connecting' });
    expect(events).not.toContainEqual({ type: 'state', state: 'listening' });
    probe.receive(JSON.stringify({ type: 'mute', muted: true }));
    finish?.({
      send,
      close: closeStt,
      async *[Symbol.asyncIterator]() {
        /* This stale session must never be consumed. */
      },
    });
    await settle();
    probe.receive(new Uint8Array(20));
    expect(send).not.toHaveBeenCalled();
    expect(closeStt).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    probe.dispose();
  });

  it('bounds frame floods and disposes the connection', () => {
    const { probe, close } = setup();
    for (let i = 0; i < 101; i++)
      probe.receive(JSON.stringify({ type: 'ping', id: String(i) }));
    expect(close).toHaveBeenCalledWith(1008, 'Frame limit');
    probe.dispose();
  });
});
