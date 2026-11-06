// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InCallView } from '@/components/call/in-call-view';
import messages from '@/messages/en.json';

// The agent watchdog ends a call whose agent never joins, or leaves and does
// not come back, within ten seconds.

const mocks = vi.hoisted(() => ({
  agent: undefined as object | undefined,
  connectionState: 'connected',
  disconnect: vi.fn(async () => undefined),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@livekit/components-react', () => ({
  useConnectionState: () => mocks.connectionState,
  useLocalParticipant: () => ({
    isMicrophoneEnabled: true,
    localParticipant: { setMicrophoneEnabled: vi.fn() },
    microphoneTrack: undefined,
  }),
  useVoiceAssistant: () => ({ agent: mocks.agent, state: 'listening' }),
}));
vi.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: () => ({
    isNoiseFilterEnabled: false,
    isNoiseFilterPending: false,
    setNoiseFilterEnabled: vi.fn(),
  }),
}));
vi.mock('livekit-client', () => ({
  ConnectionState: { Connected: 'connected', Disconnected: 'disconnected' },
}));
vi.mock('@/hooks/use-agent', () => ({
  useAgent: () => ({ agent: mocks.agent }),
}));
vi.mock('@/hooks/use-connection', () => ({
  useConnection: () => ({ disconnect: mocks.disconnect }),
}));
vi.mock('@/hooks/use-persistent-media-device', () => ({
  usePersistentMediaDevice: () => ({
    activeDeviceId: 'default',
    devices: [],
    setActiveMediaDevice: vi.fn(),
  }),
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, info: mocks.toastInfo },
}));

const character = {
  id: '6f1d9c2a-0000-4000-8000-000000000001',
  instructions: '',
  name: 'Lily',
  sessionConfig: {
    maxOutputTokens: null,
    model: 'grok-voice-think-fast-2.0',
    temperature: 0.8,
    voice: 'Ara',
  },
} as const;

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InCallView elapsed="00:12" preset={character} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.agent = undefined;
  mocks.connectionState = 'connected';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('agent watchdog', () => {
  it('ends the call when the agent never joins', () => {
    renderView();

    act(() => vi.advanceTimersByTime(9999));
    expect(mocks.disconnect).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      messages.call.agentUnavailable,
    );
  });

  it('ends the call quietly when the agent leaves and does not return', () => {
    mocks.agent = {};
    const view = renderView();
    act(() => vi.advanceTimersByTime(20_000));
    expect(mocks.disconnect).not.toHaveBeenCalled();

    mocks.agent = undefined;
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <InCallView elapsed="00:13" preset={character} />
      </NextIntlClientProvider>,
    );
    act(() => vi.advanceTimersByTime(10_000));

    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.toastInfo).toHaveBeenCalledExactlyOnceWith(
      messages.call.disconnected,
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('waits for the room before timing the agent', () => {
    mocks.connectionState = 'connecting';
    renderView();

    act(() => vi.advanceTimersByTime(30_000));

    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
});
