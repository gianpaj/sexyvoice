// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CallAgent } from '@/components/call/call-agent';

// The RPC methods and payloads the SexyCall agent calls in the browser.

const mocks = vi.hoisted(() => {
  const rpcHandlers = new Map<
    string,
    (data: { payload: string }) => Promise<string>
  >();

  return {
    agent: undefined as object | undefined,
    agentChanged: vi.fn(),
    fail: vi.fn(),
    room: {
      registerRpcMethod: vi.fn(
        (
          method: string,
          handler: (data: { payload: string }) => Promise<string>,
        ) => {
          rpcHandlers.set(method, handler);
        },
      ),
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
  useVoiceAssistant: () => ({ agent: mocks.agent, state: 'listening' }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

vi.mock('@/components/call/call-session', () => ({
  useCallSession: () => ({
    agentChanged: mocks.agentChanged,
    fail: mocks.fail,
  }),
}));

async function renderAgent() {
  render(<CallAgent />);
  await waitFor(() => {
    expect(mocks.rpcHandlers.has('pg.error')).toBe(true);
  });
}

afterEach(() => {
  mocks.rpcHandlers.clear();
  mocks.agent = undefined;
  vi.clearAllMocks();
});

describe('CallAgent', () => {
  it('reports the agent and its state to the call session', () => {
    mocks.agent = {};
    render(<CallAgent />);
    expect(mocks.agentChanged).toHaveBeenCalledWith(true, 'listening');
  });

  it('ends the call with the code the agent sends', async () => {
    await renderAgent();

    let reply: string | undefined;
    await act(async () => {
      reply = await mocks.rpcHandlers.get('pg.error')?.({
        payload: JSON.stringify({
          error: 'instructions_rejected',
          message: 'Server fallback',
        }),
      });
    });

    expect(mocks.fail).toHaveBeenCalledExactlyOnceWith('instructions_rejected');
    expect(JSON.parse(reply ?? '')).toEqual({ handled: true });
  });

  it.each([
    { toast: 'toastError', variant: 'error' },
    { toast: 'toastWarning', variant: 'warning' },
    { toast: 'toastSuccess', variant: 'success' },
    { toast: 'toastInfo', variant: undefined },
  ] as const)(
    'shows a $variant toast from the agent',
    async ({ toast, variant }) => {
      await renderAgent();

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
      expect(mocks.fail).not.toHaveBeenCalled();
      expect(JSON.parse(reply ?? '')).toEqual({ shown: true });
    },
  );
});
