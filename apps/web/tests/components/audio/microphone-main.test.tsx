// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useMediaDeviceSelect = vi.hoisted(() => vi.fn());
vi.mock('@livekit/components-react', () => ({ useMediaDeviceSelect }));
vi.mock('@/components/audio/microphone-visualizer', () => ({
  MicrophoneVisualizer: () => null,
}));

import { MicrophoneMain } from '@/components/audio/microphone-main';
import messages from '@/messages/en.json';

function renderMicrophone(
  props: Partial<ComponentProps<typeof MicrophoneMain>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MicrophoneMain
        mediaBlob={null}
        mediaStream={null}
        onClearMediaStream={vi.fn()}
        onToggleMicrophone={vi.fn()}
        status="idle"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

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

describe('MicrophoneMain record button', () => {
  it('records from a labelled button and stops from a Stop button', async () => {
    const user = userEvent.setup();
    const onToggleMicrophone = vi.fn();
    const { rerender } = renderMicrophone({ onToggleMicrophone });

    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(onToggleMicrophone).toHaveBeenCalledOnce();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MicrophoneMain
          mediaBlob={null}
          mediaStream={null}
          onClearMediaStream={vi.fn()}
          onToggleMicrophone={onToggleMicrophone}
          status="recording"
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.queryByRole('button', { name: 'Record' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onToggleMicrophone).toHaveBeenCalledTimes(2);
  });
});

describe('MicrophoneMain device list', () => {
  it('reports the menu input so the recorder can use it', async () => {
    useMediaDeviceSelect.mockImplementation(() => ({
      activeDeviceId: 'usb-mic',
      className: '',
      devices: [device('usb-mic', 'USB Microphone')],
      setActiveMediaDevice: vi.fn().mockResolvedValue(undefined),
    }));
    const onDeviceChange = vi.fn();
    renderMicrophone({ onDeviceChange });

    await screen.findByRole('button', { name: 'Choose microphone' });
    expect(onDeviceChange).toHaveBeenCalledWith('usb-mic');
  });

  it('lists named inputs once the dropdown is opened', async () => {
    const user = userEvent.setup();
    renderMicrophone();
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
    // One separator, under the heading; none trails the list.
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });
});
