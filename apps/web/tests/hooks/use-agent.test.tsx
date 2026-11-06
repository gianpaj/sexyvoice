// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentProvider } from '@/hooks/use-agent';

const mocks = vi.hoisted(() => {
  const rpcHandlers = new Map<
    string,
    (data: { payload: string }) => Promise<string>
  >();

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
    toastInfo: vi.fn(),
    toastSuccess: vi.fn(),
    toastWarning: vi.fn(),
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
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      instructionsRejected: 'Localized instruction rejection',
    };
    if (values) return `${key} ${JSON.stringify(values)}`;
    return messages[key] ?? key;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
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

  it.each([
    { error: 'active_call', shown: 'activeCallError' },
    { error: 'insufficient_credits', shown: 'notEnoughCredits {"count":1000}' },
    { error: 'agent_crashed', message: 'Agent text', shown: 'Agent text' },
    { error: 'agent_crashed', shown: 'An error occurred' },
  ])(
    'shows $shown for the $error code and ends the call',
    async ({ error, message, shown }) => {
      render(
        <AgentProvider>
          <div />
        </AgentProvider>,
      );
      await waitFor(() => {
        expect(mocks.rpcHandlers.has('pg.error')).toBe(true);
      });

      let reply: string | undefined;
      await act(async () => {
        reply = await mocks.rpcHandlers.get('pg.error')?.({
          payload: JSON.stringify({ error, message }),
        });
      });

      expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(shown);
      expect(mocks.disconnect).toHaveBeenCalledOnce();
      expect(JSON.parse(reply ?? '')).toEqual({ handled: true });
    },
  );
});

describe('AgentProvider toasts', () => {
  afterEach(() => {
    mocks.rpcHandlers.clear();
    vi.clearAllMocks();
  });

  it.each([
    { toast: 'toastError', variant: 'error' },
    { toast: 'toastWarning', variant: 'warning' },
    { toast: 'toastSuccess', variant: 'success' },
    { toast: 'toastInfo', variant: undefined },
  ] as const)(
    'shows a $variant toast from the agent',
    async ({ toast, variant }) => {
      render(
        <AgentProvider>
          <div />
        </AgentProvider>,
      );
      await waitFor(() => {
        expect(mocks.rpcHandlers.has('pg.toast')).toBe(true);
      });

      let reply: string | undefined;
      await act(async () => {
        reply = await mocks.rpcHandlers.get('pg.toast')?.({
          payload: JSON.stringify({
            description: 'Ten minutes left',
            title: 'Credits',
            variant,
          }),
        });
      });

      expect(mocks[toast]).toHaveBeenCalledExactlyOnceWith(
        'Credits: Ten minutes left',
      );
      expect(mocks.disconnect).not.toHaveBeenCalled();
      expect(JSON.parse(reply ?? '')).toEqual({ shown: true });
    },
  );
});
