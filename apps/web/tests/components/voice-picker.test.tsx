// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VoicePicker } from '@/components/voice-picker';
import messages from '@/messages/en.json';

const voices = ['tara', 'kore'].map(
  (name): Tables<'voices'> => ({
    created_at: null,
    description: null,
    feature: 'tts',
    id: name,
    is_nsfw: false,
    is_public: true,
    language: 'en',
    model: 'gpro',
    name,
    sample_prompt: null,
    sample_url: `https://example.com/${name}.mp3`,
    sort_order: 1,
    type: null,
    updated_at: null,
    user_id: 'test-user',
  }),
);

class PreviewAudio extends EventTarget {
  static instances: PreviewAudio[] = [];
  currentTime = 0;
  duration = 10;
  src: string;
  pause = vi.fn();
  play = vi.fn(() => Promise.resolve());

  constructor(src: string) {
    super();
    this.src = src;
    PreviewAudio.instances.push(this);
  }
}

async function openVoicePicker() {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  const result = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VoicePicker onValueChange={onValueChange} voices={voices} />
    </NextIntlClientProvider>,
  );
  await user.click(screen.getByRole('combobox'));
  return { ...result, onValueChange, user };
}

beforeEach(() => {
  PreviewAudio.instances = [];
  vi.stubGlobal('Audio', PreviewAudio);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VoicePicker preview', () => {
  it('tracks audio position and resets when playback ends', async () => {
    const { onValueChange, user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview tara' }));

    const audio = PreviewAudio.instances[0];
    const button = screen.getByRole('button', {
      name: 'Stop preview of tara',
    });
    const ring = button.querySelector('circle[stroke-linecap="round"]');
    expect(audio.src).toBe(voices[0].sample_url);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(onValueChange).not.toHaveBeenCalled();

    audio.currentTime = 5;
    await waitFor(() =>
      expect(ring).toHaveAttribute('stroke-dasharray', '0.5 1'),
    );
    audio.currentTime = 8;
    await waitFor(() =>
      expect(ring).toHaveAttribute('stroke-dasharray', '0.8 1'),
    );

    act(() => audio.dispatchEvent(new Event('ended')));
    expect(
      screen.getByRole('button', { name: 'Preview tara' }),
    ).toBeInTheDocument();
    expect(ring).not.toBeInTheDocument();
    expect(audio.pause).toHaveBeenCalledOnce();
  });

  it('keeps the ring empty until the duration is available', async () => {
    const { user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview tara' }));
    const audio = PreviewAudio.instances[0];
    audio.duration = Number.NaN;
    audio.currentTime = 2;
    const ring = screen
      .getByRole('button', { name: 'Stop preview of tara' })
      .querySelector('circle[stroke-linecap="round"]');
    await waitFor(() =>
      expect(ring).toHaveAttribute('stroke-dasharray', '0 1'),
    );
    audio.duration = 10;
    await waitFor(() =>
      expect(ring).toHaveAttribute('stroke-dasharray', '0.2 1'),
    );
  });

  it('stops on a second click and restarts the sample from the beginning', async () => {
    const { user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview tara' }));
    const first = PreviewAudio.instances[0];
    first.currentTime = 5;
    await user.click(
      screen.getByRole('button', { name: 'Stop preview of tara' }),
    );
    expect(first.pause).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Preview tara' }));
    expect(PreviewAudio.instances).toHaveLength(2);
    expect(PreviewAudio.instances[1].currentTime).toBe(0);
  });

  it('ignores a stale play rejection after switching voices', async () => {
    let rejectPlayback: (reason: Error) => void = () => {};
    const play = vi.fn().mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPlayback = reject;
        }),
    );
    vi.stubGlobal(
      'Audio',
      class extends PreviewAudio {
        play = play;
      },
    );
    play.mockResolvedValue(undefined);

    const { user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview tara' }));
    const first = PreviewAudio.instances[0];
    await user.click(screen.getByRole('button', { name: 'Preview kore' }));
    expect(first.pause).toHaveBeenCalledOnce();

    await act(async () => rejectPlayback(new Error('Playback interrupted')));
    act(() => first.dispatchEvent(new Event('ended')));
    expect(
      screen.getByRole('button', { name: 'Stop preview of kore' }),
    ).toBeInTheDocument();
    expect(PreviewAudio.instances[1].pause).not.toHaveBeenCalled();
  });

  it('resets on a media error', async () => {
    const { user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview tara' }));
    const audio = PreviewAudio.instances[0];
    act(() => audio.dispatchEvent(new Event('error')));
    expect(
      screen.getByRole('button', { name: 'Preview tara' }),
    ).toBeInTheDocument();
    expect(audio.pause).toHaveBeenCalledOnce();
  });

  it('stops playback when the popover closes or the component unmounts', async () => {
    const { unmount, user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview tara' }));
    await user.keyboard('{Escape}');
    expect(PreviewAudio.instances[0].pause).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('button', { name: 'Preview kore' }));
    unmount();
    expect(PreviewAudio.instances[1].pause).toHaveBeenCalledOnce();
  });
});
