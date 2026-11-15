// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { InCallView } from '@/components/call/in-call-view';
import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';
import type {
  CallRecording,
  CallRecordingMode,
} from '@/hooks/use-call-recording';
import messages from '@/messages/en.json';

vi.mock('@livekit/components-react', () => ({
  useConnectionState: () => 'connected',
  useLocalParticipant: () => ({
    isMicrophoneEnabled: true,
    localParticipant: { setMicrophoneEnabled: vi.fn() },
  }),
  useVoiceAssistant: () => ({ state: 'listening' }),
}));
vi.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: () => ({
    isNoiseFilterEnabled: false,
    isNoiseFilterPending: false,
    setNoiseFilterEnabled: vi.fn(),
  }),
}));
vi.mock('livekit-client', () => ({
  ConnectionState: { Connected: 'connected' },
}));
vi.mock('@/hooks/use-agent', () => ({ useAgent: () => ({ agent: {} }) }));
vi.mock('@/hooks/use-connection', () => ({
  useConnection: () => ({ disconnect: vi.fn() }),
}));
vi.mock('@/hooks/use-persistent-media-device', () => ({
  usePersistentMediaDevice: () => ({
    activeDeviceId: '',
    devices: [],
    setActiveMediaDevice: vi.fn(),
  }),
}));
vi.mock('@/components/call/krisp-noise-filter', () => ({
  enableKrispNoiseFilterIfReady: () => Promise.resolve(),
  isExpectedKrispNoiseFilterError: () => true,
}));
vi.mock('@/hooks/use-call-recording', () => ({ canRecordCalls: () => true }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

const preset: Preset = {
  id: '6f1d9c2a-0000-4000-8000-000000000001',
  instructions: '',
  isPublic: true,
  localizedDescriptions: { en: 'Shy, warm, and playful.' },
  name: 'Lily',
  sessionConfig: { ...defaultSessionConfig, voice: 'Ara' },
  voiceName: 'Ara',
  voiceSampleUrl: 'https://cdn.example.com/ara.mp3',
};

function renderView(mode: CallRecordingMode | null) {
  const recording: CallRecording = {
    files: {},
    mode,
    start: vi.fn(),
    stop: vi.fn(),
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InCallView elapsed="00:12" preset={preset} recording={recording} />
    </NextIntlClientProvider>,
  );
  return recording;
}

describe('InCallView recording', () => {
  it.each([
    ['Voice only', 'audio'],
    ['Voice and video', 'video'],
  ] as const)('starts a %s recording from the menu', async (label, mode) => {
    const user = userEvent.setup();
    const recording = renderView(null);

    await user.click(screen.getByRole('button', { name: 'Record' }));
    await user.click(await screen.findByRole('menuitem', { name: label }));

    expect(recording.start).toHaveBeenCalledWith(mode);
  });

  it('stops a running recording', async () => {
    const user = userEvent.setup();
    const recording = renderView('video');

    expect(
      screen.queryByRole('button', { name: 'Record' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));

    expect(recording.stop).toHaveBeenCalled();
  });
});
