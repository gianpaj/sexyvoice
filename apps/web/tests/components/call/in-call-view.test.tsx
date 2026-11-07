// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CallPhase } from '@/components/call/call-session';
import { InCallView } from '@/components/call/in-call-view';
import messages from '@/messages/en.json';
import { makeCharacter } from '../../utils/call-test-utils';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  elapsed: 0,
  microphoneEnabled: true,
  phase: { name: 'idle' } as CallPhase,
}));

vi.mock('@livekit/components-react', () => ({
  useLocalParticipant: () => ({
    isMicrophoneEnabled: mocks.microphoneEnabled,
    localParticipant: { setMicrophoneEnabled: vi.fn(async () => undefined) },
    microphoneTrack: undefined,
  }),
}));
vi.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: () => ({
    isNoiseFilterEnabled: false,
    isNoiseFilterPending: false,
    setNoiseFilterEnabled: vi.fn(),
  }),
}));
vi.mock('@/components/call/call-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/call/call-session')>()),
  useCallElapsed: () => mocks.elapsed,
  useCallSession: () => ({
    disconnect: mocks.disconnect,
    session: { ended: null, phase: mocks.phase, room: null },
  }),
}));
vi.mock('@/hooks/use-persistent-media-device', () => ({
  usePersistentMediaDevice: () => ({
    activeDeviceId: 'default',
    devices: [],
    setActiveMediaDevice: vi.fn(),
  }),
}));
vi.mock('next/image', () => ({ default: () => null }));

const character = makeCharacter({
  id: '6f1d9c2a-0000-4000-8000-000000000001',
  isPublic: true,
  name: 'Lily',
});

const inRoom = (
  name: 'connecting' | 'connected',
  agentState: 'disconnected' | 'listening' | 'speaking',
): CallPhase => ({
  agentPresent: agentState !== 'disconnected',
  agentSeen: agentState !== 'disconnected',
  agentState,
  characterId: character.id,
  name,
  startedAt: name === 'connected' ? 0 : null,
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InCallView preset={character} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.elapsed = 0;
  mocks.microphoneEnabled = true;
  mocks.phase = inRoom('connecting', 'disconnected');
});
afterEach(cleanup);

describe('InCallView', () => {
  it('shows the call connecting', () => {
    renderView();
    expect(screen.getByText(messages.call.inCall.connecting)).toBeVisible();
    expect(screen.getByText('00:00')).toBeVisible();
  });

  it("shows the agent's state and the call time", () => {
    mocks.phase = inRoom('connected', 'speaking');
    mocks.elapsed = 75;
    renderView();
    expect(screen.getByText(messages.call.inCall.speaking)).toBeVisible();
    expect(screen.getByText('01:15')).toBeVisible();
  });

  it('shows a muted microphone before the agent state', () => {
    mocks.phase = inRoom('connected', 'listening');
    mocks.microphoneEnabled = false;
    renderView();
    expect(screen.getByText(messages.call.inCall.muted)).toBeVisible();
  });

  it('ends the call', () => {
    mocks.phase = inRoom('connected', 'listening');
    renderView();
    fireEvent.click(
      screen.getByRole('button', { name: messages.call.inCall.end }),
    );
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
});
