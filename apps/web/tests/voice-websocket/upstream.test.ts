import { describe, expect, it, vi } from 'vitest';

import { grokLiveTranscription } from '@/lib/voice-websocket/upstream/grok';
import { transcriptionSession } from '@/lib/voice-websocket/upstream/session';
import {
  bytesToBase64,
  openLiveSocket,
  type WebSocketConstructor,
} from '@/lib/voice-websocket/upstream/socket';

class FakeSocket extends EventTarget {
  static last: FakeSocket;
  readyState = 0;
  binaryType = '';
  send = vi.fn();
  url: string;
  protocols?: string | string[];
  constructor(url: string, protocols?: string | string[]) {
    super();
    this.url = url;
    this.protocols = protocols;
    FakeSocket.last = this;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  message(data: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(data) }),
    );
  }
  close(code = 1000) {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason: '' }));
  }
}
const Socket = FakeSocket as unknown as WebSocketConstructor;

describe('pinned TanStack PR #1964 xAI adapter', () => {
  it('waits for setup, passes PCM, and avoids repeating committed text on utterance-final', async () => {
    const connecting = transcriptionSession({
      adapter: grokLiveTranscription('grok-voice-transcribe-2.0', {
        apiKey: 'test-key',
        WebSocket: Socket,
      }),
      audio: { encoding: 'linear16', sampleRate: 48_000 },
    });
    const socket = FakeSocket.last;
    expect(socket.url).toContain('model=grok-voice-transcribe-2.0');
    expect(socket.protocols).toEqual(['xai-client-secret.test-key']);
    socket.open();
    socket.message({ type: 'transcript.created' });
    const session = await connecting;
    session.send(new Uint8Array([0, 0]));
    expect(socket.send).toHaveBeenCalledWith(new Uint8Array([0, 0]));
    socket.message({
      type: 'transcript.partial',
      text: 'Hello',
      is_final: true,
    });
    socket.message({
      type: 'transcript.partial',
      text: 'Hello world',
      is_final: true,
      speech_final: true,
    });
    const iterator = session[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({
      type: 'final',
      text: 'Hello',
    });
    expect((await iterator.next()).value).toEqual({
      type: 'final',
      text: 'world',
    });
    expect((await iterator.next()).value).toEqual({ type: 'turn-end' });
    const closing = session.close();
    expect(socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'audio.done' }),
    );
    socket.close();
    await closing;
    expect((await iterator.next()).done).toBe(true);
  });

  it('rejects setup errors and abort during connection without leaving timers', async () => {
    const controller = new AbortController();
    const pending = openLiveSocket({
      url: 'wss://test.invalid',
      WebSocket: Socket,
      connect: { emit: vi.fn(), end: vi.fn(), abortSignal: controller.signal },
      onMessage: vi.fn(),
    });
    controller.abort();
    await expect(pending).rejects.toThrow('Could not connect');
    expect(FakeSocket.last.readyState).toBe(3);
  });

  it('closes on readiness timeout and reports unexpected disconnection', async () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const end = vi.fn();
    const timeout = openLiveSocket({
      url: 'wss://test.invalid',
      WebSocket: Socket,
      connect: { emit, end },
      connectTimeoutMs: 50,
      onMessage: vi.fn(),
    });
    const rejected = expect(timeout).rejects.toThrow('Timed out');
    vi.advanceTimersByTime(50);
    await rejected;
    expect(FakeSocket.last.readyState).toBe(3);
    vi.useRealTimers();
    const pending = openLiveSocket({
      url: 'wss://test.invalid',
      WebSocket: Socket,
      connect: { emit, end },
      onMessage: vi.fn(),
    });
    FakeSocket.last.open();
    await pending;
    FakeSocket.last.close(1006);
    expect(emit).toHaveBeenCalledWith({
      type: 'error',
      error: expect.any(Error),
    });
    expect(end).toHaveBeenCalledTimes(2);
  });

  it('encodes only a byte view, excluding unrelated pooled bytes', () => {
    expect(bytesToBase64(new Uint8Array([99, 1, 2, 99]).subarray(1, 3))).toBe(
      'AQI=',
    );
  });
});
