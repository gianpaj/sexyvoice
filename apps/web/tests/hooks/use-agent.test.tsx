// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentProvider } from '@/hooks/use-agent';

const mocks = vi.hoisted(() => {
  const rpcHandlers = new Map<string, (data: { payload: string }) => Promise<string>>();

  return {
    disconnect: vi.fn(async () => undefined),
    room: {
      off: vi.fn(),
      on: vi.fn(),
      registerByteStreamHandler: vi.fn(),
      registerRpcMethod: vi.fn(
        (
          method: string,
          handler: (data: { payload: string }) => Promise<string>,
        ) => {
          rpcHandlers.set(method, handler);
        },
      ),
      unregisterByteStreamHandler: vi.fn(),
      unregisterRpcMethod: vi.fn(),
    },
    rpcHandlers,
    toastError: vi.fn(),
  };
});

vi.mock('@livekit/components-react', () => ({
  useMaybeRoomContext: () => mocks.room,
  useVoiceAssistant: () => ({ agent: undefined }),
}));

vi.mock('livekit-client', () => ({
  RoomEvent: { TranscriptionReceived: 'transcriptionReceived' },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      instructionsRejected: 'Localized instruction rejection',
    };
    return messages[key] ?? key;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/hooks/use-connection', () => ({
  useConnection: () => ({
    disconnect: mocks.disconnect,
    shouldConnect: false,
  }),
}));

describe('AgentProvider errors', () => {
  afterEach(() => {
    mocks.rpcHandlers.clear();
    vi.clearAllMocks();
  });

  it('translates an instruction rejection code before disconnecting', async () => {
    render(
      <AgentProvider>
        <div />
      </AgentProvider>,
    );

    await waitFor(() => {
      expect(mocks.rpcHandlers.has('pg.error')).toBe(true);
    });

    await act(async () => {
      await mocks.rpcHandlers.get('pg.error')?.({
        payload: JSON.stringify({
          error: 'instructions_rejected',
          message: 'Server fallback',
        }),
      });
    });

    expect(mocks.toastError).toHaveBeenCalledWith(
      'Localized instruction rejection',
    );
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
});
