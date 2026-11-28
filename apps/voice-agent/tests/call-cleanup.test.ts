import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeCall } from '../src/call-cleanup.ts';

afterEach(() => vi.useRealTimers());

describe('JS call teardown', () => {
  it('flushes after a normal close without forcing a disconnect', async () => {
    const closeSession = vi.fn().mockResolvedValue(undefined);
    const disconnect = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const onCloseFailure = vi.fn();

    await closeCall({ closeSession, disconnect, flush, onCloseFailure });
    expect(closeSession).toHaveBeenCalledBefore(flush);
    expect(disconnect).not.toHaveBeenCalled();
    expect(onCloseFailure).not.toHaveBeenCalled();
  });

  it('disconnects and flushes when the LiveKit session hangs', async () => {
    vi.useFakeTimers();
    const closeSession = () => new Promise<void>(() => undefined);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const flush = vi.fn().mockResolvedValue(undefined);
    const onCloseFailure = vi.fn();

    const closed = closeCall({
      closeSession,
      disconnect,
      flush,
      onCloseFailure,
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await closed;
    expect(onCloseFailure).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledBefore(flush);
  });

  it('keeps the lease when disconnection also fails', async () => {
    const closeSession = vi.fn().mockRejectedValue(new Error('close failed'));
    const disconnect = vi
      .fn()
      .mockRejectedValue(new Error('disconnect failed'));
    const flush = vi.fn();

    await expect(
      closeCall({ closeSession, disconnect, flush, onCloseFailure: vi.fn() }),
    ).rejects.toThrow('disconnect failed');
    expect(flush).not.toHaveBeenCalled();
  });
});
