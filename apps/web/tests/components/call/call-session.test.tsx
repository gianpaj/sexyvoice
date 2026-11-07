// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CallSessionProvider,
  formatCallTime,
  useCallElapsed,
  useCallSession,
} from '@/components/call/call-session';
import messages from '@/messages/en.json';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(() => Promise.resolve()) },
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}));
vi.mock('@/lib/supabase/client', () => {
  const client = { auth: { getClaims: mocks.getClaims } };
  return { default: () => client };
});
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, info: mocks.toastInfo },
}));

let call: ReturnType<typeof useCallSession>;
let elapsed = 0;

function Probe() {
  call = useCallSession();
  elapsed = useCallElapsed();
  return null;
}

async function startConnectedCall() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallSessionProvider>
        <Probe />
      </CallSessionProvider>
    </NextIntlClientProvider>,
  );
  await act(async () => {
    await call.connect({ characterId: 'character-id' });
  });
  act(() => call.roomConnected());
}

const agent = (
  present: boolean,
  state: Parameters<typeof call.agentChanged>[1],
) => act(() => call.agentChanged(present, state));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: 'call-user' } },
    error: null,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ accessToken: 'token', url: 'wss://test.livekit.cloud' }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('agent watchdog', () => {
  it('ends the call when the agent never joins', async () => {
    await startConnectedCall();

    act(() => vi.advanceTimersByTime(9999));
    expect(call.session.phase.name).toBe('connected');
    act(() => vi.advanceTimersByTime(1));

    expect(call.session.phase.name).toBe('idle');
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      messages.call.agentUnavailable,
    );
  });

  it('ends the call quietly when the agent leaves and does not return', async () => {
    await startConnectedCall();
    agent(true, 'listening');
    act(() => vi.advanceTimersByTime(20_000));
    expect(call.session.phase.name).toBe('connected');

    agent(false, 'disconnected');
    act(() => vi.advanceTimersByTime(10_000));

    expect(call.session.phase.name).toBe('idle');
    expect(mocks.toastInfo).toHaveBeenCalledExactlyOnceWith(
      messages.call.disconnected,
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('waits for the room before timing the agent', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CallSessionProvider>
          <Probe />
        </CallSessionProvider>
      </NextIntlClientProvider>,
    );
    await act(async () => {
      await call.connect({ characterId: 'character-id' });
    });
    act(() => vi.advanceTimersByTime(29_000));

    expect(call.session.phase.name).toBe('connecting');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});

describe('call timer', () => {
  it('starts when the agent is ready, not when the room connects', async () => {
    await startConnectedCall();
    agent(true, 'initializing');
    act(() => vi.advanceTimersByTime(5000));
    expect(elapsed).toBe(0);

    agent(true, 'speaking');
    act(() => vi.advanceTimersByTime(3000));
    expect(formatCallTime(elapsed)).toBe('00:03');
  });

  it('keeps counting while the agent restarts and records the call length', async () => {
    await startConnectedCall();
    agent(true, 'listening');
    act(() => vi.advanceTimersByTime(2000));
    agent(true, 'initializing');
    act(() => vi.advanceTimersByTime(2000));
    expect(formatCallTime(elapsed)).toBe('00:04');

    act(() => call.disconnect());

    expect(elapsed).toBe(0);
    expect(call.session.ended).toEqual({
      characterId: 'character-id',
      seconds: 4,
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it('formats an hour-long call', () => {
    expect(formatCallTime(3725)).toBe('01:02:05');
  });
});

describe('agent errors', () => {
  it.each([
    ['active_call', messages.call.activeCallError],
    [
      'insufficient_credits',
      messages.call.notEnoughCredits.replace('{count}', '1000'),
    ],
    ['instructions_rejected', messages.call.instructionsRejected],
    ['agent_crashed', messages.call.agentError],
    [undefined, messages.call.agentError],
  ])('ends the call with the %s message', async (code, message) => {
    await startConnectedCall();
    agent(true, 'listening');

    act(() => call.fail(code));

    expect(call.session.phase.name).toBe('idle');
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(message);
  });
});
