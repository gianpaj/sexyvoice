// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setKey = vi.fn().mockResolvedValue(undefined);
const setE2EEEnabled = vi.fn().mockResolvedValue(undefined);
const terminate = vi.fn();
const disconnect = vi.fn().mockResolvedValue(undefined);

let roomOptions: unknown;
let e2eeSupported = true;

vi.mock('livekit-client', () => ({
  Room: class MockRoom {
    setE2EEEnabled = setE2EEEnabled;
    disconnect = disconnect;

    constructor(options: unknown) {
      roomOptions = options;
    }
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/livekit/e2ee/client', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/livekit/e2ee/client')
  >('@/lib/livekit/e2ee/client');

  return {
    ...actual,
    createCallE2ee: () =>
      e2eeSupported
        ? {
            keyProvider: { setKey },
            options: { keyProvider: { setKey }, worker: {} },
            terminate,
          }
        : null,
  };
});

const { useCallRoom } = await import('@/hooks/use-call-room');
const { CallE2eeUnsupportedError } = await import('@/lib/livekit/e2ee/client');

beforeEach(() => {
  vi.clearAllMocks();
  e2eeSupported = true;
  roomOptions = undefined;
});

describe('useCallRoom', () => {
  it('creates the room with encryption options when supported', async () => {
    const { result } = renderHook(() => useCallRoom(null, false));

    await waitFor(() => expect(result.current.room).not.toBeNull());
    expect(roomOptions).toMatchObject({
      publishDefaults: { stopMicTrackOnMute: true },
      e2ee: expect.any(Object),
    });
  });

  it('omits encryption options when the browser cannot support it', async () => {
    e2eeSupported = false;
    const { result } = renderHook(() => useCallRoom(null, false));

    await waitFor(() => expect(result.current.room).not.toBeNull());
    expect(roomOptions).not.toHaveProperty('e2ee');
  });

  it('connects immediately when encryption is disabled server-side', async () => {
    const { result } = renderHook(() => useCallRoom(null, true));

    await waitFor(() => expect(result.current.canConnect).toBe(true));
    expect(setE2EEEnabled).not.toHaveBeenCalled();
  });

  it('waits for the shared key to be applied before connecting', async () => {
    const { result, rerender } = renderHook(
      ({ key, connect }: { key: string | null; connect: boolean }) =>
        useCallRoom(key, connect),
      { initialProps: { key: null as string | null, connect: false } },
    );

    await waitFor(() => expect(result.current.room).not.toBeNull());

    // The key is only applied once a call is actually requested.
    rerender({ key: 'shared-passphrase', connect: false });
    expect(setKey).not.toHaveBeenCalled();
    expect(result.current.canConnect).toBe(false);

    rerender({ key: 'shared-passphrase', connect: true });

    await waitFor(() => expect(result.current.canConnect).toBe(true));
    expect(setKey).toHaveBeenCalledWith('shared-passphrase');
    expect(setE2EEEnabled).toHaveBeenCalledWith(true);
  });

  it('retries applying the key on the next connection attempt after a failure', async () => {
    setKey.mockRejectedValueOnce(new Error('derivation failed'));

    const { result, rerender } = renderHook(
      ({ connect }: { connect: boolean }) =>
        useCallRoom('shared-passphrase', connect),
      { initialProps: { connect: true } },
    );

    await waitFor(() => expect(result.current.e2eeError).not.toBeNull());
    expect(result.current.canConnect).toBe(false);

    // The connect button unwinds the attempt, then the user tries again.
    rerender({ connect: false });
    rerender({ connect: true });

    await waitFor(() => expect(result.current.canConnect).toBe(true));
    expect(setKey).toHaveBeenCalledTimes(2);
  });

  it('never connects when the browser cannot encrypt but a key was issued', async () => {
    e2eeSupported = false;
    const { result } = renderHook(() => useCallRoom('shared-passphrase', true));

    await waitFor(() =>
      expect(result.current.e2eeError).toBeInstanceOf(CallE2eeUnsupportedError),
    );
    expect(result.current.canConnect).toBe(false);
    expect(setE2EEEnabled).not.toHaveBeenCalled();
  });

  it('terminates the encryption worker on unmount', async () => {
    const { result, unmount } = renderHook(() => useCallRoom(null, false));

    await waitFor(() => expect(result.current.room).not.toBeNull());
    unmount();

    expect(disconnect).toHaveBeenCalled();
    expect(terminate).toHaveBeenCalled();
  });
});
