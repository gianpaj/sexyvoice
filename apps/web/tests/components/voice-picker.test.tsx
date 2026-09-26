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
    await user.click(screen.getByRole('button', { name: 'Preview Tara' }));

    const audio = PreviewAudio.instances[0];
    const button = screen.getByRole('button', {
      name: 'Stop preview of Tara',
    });
    const ring = button.querySelector('circle[stroke-dasharray]');
    expect(audio.src).toBe(voices[0].sample_url);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(ring).toHaveAttribute('stroke-linecap', 'butt');

    audio.currentTime = 5;
    await waitFor(() =>
      expect(ring).toHaveAttribute('stroke-dasharray', '0.5 1'),
    );
    expect(ring).toHaveAttribute('stroke-linecap', 'round');
    audio.currentTime = 8;
    await waitFor(() =>
      expect(ring).toHaveAttribute('stroke-dasharray', '0.8 1'),
    );

    act(() => audio.dispatchEvent(new Event('ended')));
    expect(
      screen.getByRole('button', { name: 'Preview Tara' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(ring).not.toBeInTheDocument());
    expect(audio.pause).toHaveBeenCalledOnce();
  });

  it('keeps the ring empty while the duration is unavailable', async () => {
    const { user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview Tara' }));
    const audio = PreviewAudio.instances[0];
    const ring = screen
      .getByRole('button', { name: 'Stop preview of Tara' })
      .querySelector('circle[stroke-dasharray]');

    audio.currentTime = 2;
    await waitFor(() =>
      expect(ring).toHaveAttribute('stroke-dasharray', '0.2 1'),
    );

    audio.duration = Number.NaN;
    await waitFor(() =>
      expect(ring).toHaveAttribute('stroke-dasharray', '0 1'),
    );
  });

  it('stops on a second click and restarts the sample from the beginning', async () => {
    const { user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview Tara' }));
    const first = PreviewAudio.instances[0];
    first.currentTime = 5;
    await user.click(
      screen.getByRole('button', { name: 'Stop preview of Tara' }),
    );
    expect(first.pause).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Preview Tara' }));
    expect(PreviewAudio.instances).toHaveLength(2);
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
    await user.click(screen.getByRole('button', { name: 'Preview Tara' }));
    const first = PreviewAudio.instances[0];
    await user.click(screen.getByRole('button', { name: 'Preview Kore' }));
    expect(first.pause).toHaveBeenCalledOnce();

    await act(async () =>
      rejectPlayback(
        new DOMException(
          'The play() request was interrupted by a call to pause().',
          'AbortError',
        ),
      ),
    );
    act(() => first.dispatchEvent(new Event('ended')));
    expect(
      screen.getByRole('button', { name: 'Stop preview of Kore' }),
    ).toBeInTheDocument();
    expect(PreviewAudio.instances[1].pause).not.toHaveBeenCalled();
  });

  it('resets on a media error', async () => {
    const { user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview Tara' }));
    const audio = PreviewAudio.instances[0];
    act(() => audio.dispatchEvent(new Event('error')));
    expect(
      screen.getByRole('button', { name: 'Preview Tara' }),
    ).toBeInTheDocument();
    expect(audio.pause).toHaveBeenCalledOnce();
  });

  it('stops playback when the popover closes or the component unmounts', async () => {
    const { unmount, user } = await openVoicePicker();
    await user.click(screen.getByRole('button', { name: 'Preview Tara' }));
    await user.keyboard('{Escape}');
    expect(PreviewAudio.instances[0].pause).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('button', { name: 'Preview Kore' }));
    unmount();
    expect(PreviewAudio.instances[1].pause).toHaveBeenCalledOnce();
  });
});
