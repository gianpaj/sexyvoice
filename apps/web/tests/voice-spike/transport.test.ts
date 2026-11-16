import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAudioSender } from '@/lib/voice-spike/transport';

const audio = {
  type: 'audio',
  id: 'turn',
  audio: 'AAA=',
  sampleRate: 24_000,
} as const;

function setup() {
  const callbacks: ((error?: Error) => void)[] = [];
  const socket = {
    readyState: 1,
    send: vi.fn((_data: string, callback: (error?: Error) => void) => {
      callbacks.push(callback);
    }),
  };
  const stalled = vi.fn();
  return {
    socket,
    callbacks,
    stalled,
    send: createAudioSender(socket, stalled),
  };
}

afterEach(() => vi.useRealTimers());

describe('voice audio flow control', () => {
  it('waits for each write before consuming another audio chunk across a short stall', async () => {
    vi.useFakeTimers();
    const { socket, callbacks, stalled, send } = setup();
    let consumed = 0;
    const controller = new AbortController();
    const streaming = (async () => {
      for (let i = 0; i < 30; i++) {
        consumed++;
        await send(audio, controller.signal);
      }
    })();
    expect(consumed).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(consumed).toBe(1);
    callbacks[0]();
    await Promise.resolve();
    // Each 8 KiB PCM chunk needs ~88 ms for base64 at 1 Mbps. At 24 kHz
    // that is less than its ~171 ms of playback, leaving room for jitter.
    for (let i = 1; i < 30; i++) {
      await vi.advanceTimersByTimeAsync(100);
      callbacks[i]();
      await Promise.resolve();
    }
    await streaming;
    expect(socket.send).toHaveBeenCalledTimes(30);
    expect(stalled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stalled write with a deadline and ignores its late callback', async () => {
    vi.useFakeTimers();
    const { callbacks, stalled, send } = setup();
    const result = send(audio, new AbortController().signal);
    const rejected = expect(result).rejects.toThrow('Audio delivery stalled');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(stalled).toHaveBeenCalledOnce();
    callbacks[0]();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending write without treating interruption as a stalled client', async () => {
    vi.useFakeTimers();
    const { socket, callbacks, stalled, send } = setup();
    const controller = new AbortController();
    const result = send(audio, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    callbacks[0]();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(send(audio, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(socket.send).toHaveBeenCalledOnce();
    expect(stalled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a socket write error and releases its timer', async () => {
    vi.useFakeTimers();
    const { callbacks, send, stalled } = setup();
    const result = send(audio, new AbortController().signal);
    callbacks[0](new Error('Socket closed'));
    await expect(result).rejects.toThrow('Socket closed');
    expect(stalled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
