// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { LiveKitRoomProps } from '@livekit/components-react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { DisconnectReason } from 'livekit-client';
import { NextIntlClientProvider } from 'next-intl';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectButton } from '@/components/call/connect-button';
import { RoomWrapper } from '@/components/call/room-wrapper';
import { ConnectionProvider, useConnection } from '@/hooks/use-connection';
import messages from '@/messages/en.json';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(() => Promise.resolve()) },
  roomProps: undefined as LiveKitRoomProps | undefined,
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: (props: PropsWithChildren<LiveKitRoomProps>) => {
    mocks.roomProps = props;
    return <div>{props.children}</div>;
  },
  RoomAudioRenderer: () => null,
  StartAudio: () => null,
}));
vi.mock('@/hooks/use-agent', () => ({
  AgentProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}));
vi.mock('@/lib/supabase/client', () => {
  const client = { auth: { getClaims: mocks.getClaims } };
  return { default: () => client };
});
vi.mock('@/hooks/use-playground-state', () => ({
  usePlaygroundState: () => ({
    dispatch: vi.fn(),
    helpers: {
      getFullInstructions: () => 'Character instructions',
      getSelectedPreset: () => ({ isPublic: true }),
      getStateWithFullInstructions: () => ({ sessionConfig: { voice: 'Ara' } }),
    },
    pgState: { selectedPresetId: 'character-id' },
  }),
}));
vi.mock('@/lib/characters', () => ({}));
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, info: mocks.toastInfo },
}));

function EndCallButton() {
  const { disconnect } = useConnection();
  return (
    <button onClick={() => disconnect()} type="button">
      End call
    </button>
  );
}

function TestCall() {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConnectionProvider>
        <RoomWrapper>
          <ConnectButton />
          <EndCallButton />
        </RoomWrapper>
      </ConnectionProvider>
    </NextIntlClientProvider>
  );
}

async function startCall() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
  });
  expect(mocks.roomProps?.connect).toBe(true);
  expect(screen.getByRole('button', { name: 'Connecting' })).toBeDisabled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roomProps = undefined;
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: 'call-user' } },
    error: null,
  });
  const fetchToken = vi.fn(async () =>
    Response.json({
      accessToken: `token-${fetchToken.mock.calls.length}`,
      url: 'wss://test.livekit.cloud',
    }),
  );
  vi.stubGlobal('fetch', fetchToken);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('call connection deadline', () => {
  beforeEach(() => vi.useFakeTimers());

  it('ends a pending connection at 30 seconds without extending the deadline on rerender', async () => {
    const { rerender } = render(<TestCall />);
    await startCall();
    act(() => vi.advanceTimersByTime(15_000));
    rerender(<TestCall />);

    act(() => vi.advanceTimersByTime(14_999));
    expect(screen.getByRole('button', { name: 'Connecting' })).toBeDisabled();
    expect(mocks.toastError).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(1));

    expect(mocks.roomProps?.connect).toBe(false);
    expect(screen.getByRole('button', { name: 'Start call' })).toBeEnabled();
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      "Couldn't connect to the call. Please try again.",
    );
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
  });

  it('clears the deadline when the room connects', async () => {
    render(<TestCall />);
    await startCall();
    act(() => vi.advanceTimersByTime(15_000));
    act(() => mocks.roomProps?.onConnected?.());

    await act(async () => vi.advanceTimersByTime(60_000));

    expect(mocks.roomProps?.connect).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });

  it('gives a fresh attempt its own deadline after an earlier failure', async () => {
    render(<TestCall />);
    await startCall();
    act(() => vi.advanceTimersByTime(10_000));
    await act(async () => {
      mocks.roomProps?.onError?.(new Error('Connection failed'));
    });

    await startCall();
    expect(mocks.roomProps?.token).toBe('token-2');
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(mocks.roomProps?.connect).toBe(true);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(10_000));
    expect(mocks.roomProps?.connect).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledTimes(2);
  });

  it('clears the deadline on unmount', async () => {
    const { unmount } = render(<TestCall />);
    await startCall();
    unmount();

    await act(async () => vi.advanceTimersByTime(30_000));

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
});

describe('call connection recovery', () => {
  it('resets the button after a final error and retries with a fresh token', async () => {
    render(<TestCall />);
    await startCall();
    expect(mocks.roomProps?.token).toBe('token-1');

    await act(async () => {
      mocks.roomProps?.onError?.(
        new Error('could not establish signal connection'),
      );
    });

    expect(screen.getByRole('button', { name: 'Start call' })).toBeEnabled();
    expect(mocks.roomProps?.connect).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      "Couldn't connect to the call. Please try again.",
    );

    await startCall();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.roomProps?.token).toBe('token-2');
    act(() => mocks.roomProps?.onConnected?.());
    expect(mocks.roomProps?.connect).toBe(true);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('waits for the final error when disconnect is emitted during connection setup', async () => {
    render(<TestCall />);
    await startCall();

    act(() =>
      mocks.roomProps?.onDisconnected?.(DisconnectReason.UNKNOWN_REASON),
    );
    expect(mocks.roomProps?.connect).toBe(true);
    expect(mocks.getClaims).not.toHaveBeenCalled();

    await act(async () => {
      mocks.roomProps?.onError?.(new Error('All regions failed'));
    });

    expect(screen.getByRole('button', { name: 'Start call' })).toBeEnabled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
  });

  it('keeps the pending connection and error callback stable across rerenders', async () => {
    const { rerender } = render(<TestCall />);
    await startCall();
    const onError = mocks.roomProps?.onError;
    expect(onError).toBeTypeOf('function');

    rerender(<TestCall />);

    expect(mocks.roomProps?.onError).toBe(onError);
    expect(mocks.roomProps?.connect).toBe(true);
    expect(screen.getByRole('button', { name: 'Connecting' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('allows another call after an established room disconnects', async () => {
    render(<TestCall />);
    await startCall();
    act(() => mocks.roomProps?.onConnected?.());

    await act(async () => {
      mocks.roomProps?.onDisconnected?.(DisconnectReason.SERVER_SHUTDOWN);
    });

    expect(screen.getByRole('button', { name: 'Start call' })).toBeEnabled();
    expect(mocks.roomProps?.connect).toBe(false);
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledExactlyOnceWith(
      {
        queryKey: ['credits', 'call-user'],
      },
    );
    expect(mocks.toastInfo).toHaveBeenCalledExactlyOnceWith('Disconnected');
    await startCall();
    expect(mocks.roomProps?.token).toBe('token-2');
  });

  it('does not report a failure or refresh credits twice after an intentional hangup', async () => {
    render(<TestCall />);
    await startCall();
    act(() => mocks.roomProps?.onConnected?.());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    });

    await act(async () => {
      mocks.roomProps?.onDisconnected?.(DisconnectReason.CLIENT_INITIATED);
    });

    expect(screen.getByRole('button', { name: 'Start call' })).toBeEnabled();
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it('resets the button even if refreshing credits fails', async () => {
    mocks.getClaims.mockRejectedValue(new Error('Auth unavailable'));
    render(<TestCall />);
    await startCall();

    await act(async () => {
      mocks.roomProps?.onError?.(new Error('Connection failed'));
    });

    expect(screen.getByRole('button', { name: 'Start call' })).toBeEnabled();
    expect(mocks.roomProps?.connect).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });
});
