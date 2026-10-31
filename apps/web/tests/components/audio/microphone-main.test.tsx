// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useMediaDeviceSelect = vi.hoisted(() => vi.fn());
vi.mock('@livekit/components-react', () => ({ useMediaDeviceSelect }));
vi.mock('@/components/audio/microphone-visualizer', () => ({
  MicrophoneVisualizer: () => null,
}));

import { MicrophoneMain } from '@/components/audio/microphone-main';

const device = (deviceId: string, label: string) =>
  ({ deviceId, groupId: '', kind: 'audioinput', label }) as MediaDeviceInfo;

beforeEach(() => {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
  });
  // Firefox before the page uses the microphone: one placeholder, no ID.
  useMediaDeviceSelect.mockImplementation(({ requestPermissions }) => ({
    activeDeviceId: 'default',
    className: '',
    devices: requestPermissions
      ? [device('usb-mic', 'USB Microphone'), device('laptop', 'Laptop Mic')]
      : [device('', '')],
    setActiveMediaDevice: vi.fn().mockResolvedValue(undefined),
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MicrophoneMain device list', () => {
  it('lists named inputs once the dropdown is opened', async () => {
    const user = userEvent.setup();
    render(
      <MicrophoneMain
        mediaBlob={null}
        mediaStream={null}
        onClearMediaStream={vi.fn()}
        onToggleMicrophone={vi.fn()}
        status="idle"
      />,
    );
    const trigger = await screen.findByRole('button', {
      name: 'Choose microphone',
    });
    expect(useMediaDeviceSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestPermissions: false }),
    );

    await user.click(trigger);

    expect(useMediaDeviceSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestPermissions: true }),
    );
    const items = await screen.findAllByRole('menuitemcheckbox');
    expect(items.map((item) => item.textContent)).toEqual([
      'USB Microphone',
      'Laptop Mic',
    ]);
  });
});
