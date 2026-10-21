// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import WavesurferPlayer from '@wavesurfer/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoClonePlayer } from '@/components/demo-clone/demo-clone-player';
import messages from '@/messages/en.json';

vi.mock('@wavesurfer/react', () => ({
  default: vi.fn(({ url }: { url?: string }) => (
    <div data-testid="audio-waveform" data-url={url} />
  )),
}));

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: { pathname: string; query: Record<string, string> };
    children: React.ReactNode;
  }) => (
    <a href={`${href.pathname}?${new URLSearchParams(href.query)}`} {...props}>
      {children}
    </a>
  ),
}));

const labels = messages.landing.demoClone;
const sameOriginalPrompt =
  'Downtown Drugstore had a bell on the door that made a single tink sound when you opened it.\nOxford Pharmacy had two bells on its doors, so it was more of a ta-tank, though nothing to startle over.';
const props = {
  initialSpeakerId: 'kat',
  labels,
  languageLabels: { en: 'English', de: 'German' },
};
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(WavesurferPlayer).mockClear();
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const audio = () => document.querySelector('audio')!;
const selectTake = (id: string) =>
  fireEvent.click(
    document.querySelector(`input[name="demo-clone-take"][value="${id}"]`)!,
  );

describe('Hear the difference', () => {
  it('lists Same as original first for Kat while keeping Natural selected by default', () => {
    render(<DemoClonePlayer {...props} />);
    const takes = document.querySelectorAll<HTMLInputElement>(
      'input[name="demo-clone-take"]',
    );
    expect(Array.from(takes, (take) => take.value)).toEqual([
      'sameOriginal',
      'natural',
      'sarcastic',
      'calmSlow',
    ]);
    expect(
      screen.getByRole('radio', { name: labels.sameOriginal }),
    ).not.toBeChecked();
    expect(screen.getByRole('radio', { name: labels.natural })).toBeChecked();
  });

  it('offers only the three existing deliveries for Heike', () => {
    render(<DemoClonePlayer {...props} initialSpeakerId="heike" />);
    const takes = document.querySelectorAll<HTMLInputElement>(
      'input[name="demo-clone-take"]',
    );
    expect(Array.from(takes, (take) => take.value)).toEqual([
      'natural',
      'sarcastic',
      'calmSlow',
    ]);
    expect(
      screen.queryByRole('radio', { name: labels.sameOriginal }),
    ).not.toBeInTheDocument();
  });

  it('shows the full reference passage and links to the exact Same as original take', () => {
    render(<DemoClonePlayer {...props} />);
    selectTake('sameOriginal');
    expect(
      screen.getByRole('radio', { name: labels.sameOriginal }),
    ).toBeChecked();
    expect(screen.getByTestId('demo-clone-prompt-text').textContent).toBe(
      sameOriginalPrompt,
    );
    expect(screen.getByTestId('demo-clone-result')).toHaveAttribute(
      'data-take-id',
      'sameOriginal',
    );
    expect(audio().getAttribute('src')).toBe(
      '/demo-clones/voxtral-3/kat-sameOriginal.mp3',
    );
    expect(screen.getByTestId('demo-clone-try')).toHaveAttribute(
      'href',
      '/dashboard/clone?demo=kat&take=sameOriginal',
    );
    expect(play).not.toHaveBeenCalled();
  });

  it('falls back to Natural for an unsupported initial speaker and take pairing', () => {
    render(
      <DemoClonePlayer
        {...props}
        initialSpeakerId="heike"
        initialTakeId="sameOriginal"
      />,
    );
    expect(screen.getByRole('radio', { name: labels.natural })).toBeChecked();
    expect(audio().getAttribute('src')).toBe(
      '/demo-clones/voxtral-3/heike-natural.mp3',
    );
    expect(screen.getByTestId('demo-clone-try')).toHaveAttribute(
      'href',
      '/dashboard/clone?demo=heike&take=natural',
    );
    fireEvent.click(screen.getByTestId('demo-clone-speaker-kat'));
    expect(screen.getByRole('radio', { name: labels.natural })).toBeChecked();
  });

  it('resets an unsupported take to Natural when switching speakers', async () => {
    render(<DemoClonePlayer {...props} initialTakeId="sameOriginal" />);
    expect(
      screen.getByRole('radio', { name: labels.sameOriginal }),
    ).toBeChecked();
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    await screen.findByLabelText(labels.pauseAudio);
    audio().currentTime = 2;
    fireEvent.click(screen.getByTestId('demo-clone-speaker-heike'));
    expect(
      screen.queryByRole('radio', { name: labels.sameOriginal }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: labels.natural })).toBeChecked();
    expect(screen.getByTestId('demo-clone-result')).toHaveAttribute(
      'data-take-id',
      'natural',
    );
    expect(audio().getAttribute('src')).toBe(
      '/demo-clones/voxtral-3/heike-natural.mp3',
    );
    expect(audio().currentTime).toBe(0);
    expect(screen.getByLabelText(labels.playAudio)).toBeInTheDocument();
    expect(screen.getByTestId('demo-clone-try')).toHaveAttribute(
      'href',
      '/dashboard/clone?demo=heike&take=natural',
    );
    fireEvent.click(screen.getByTestId('demo-clone-speaker-kat'));
    expect(screen.getByRole('radio', { name: labels.natural })).toBeChecked();
  });

  it.each(['natural', 'sarcastic', 'calmSlow'] as const)(
    'preserves the supported %s take when switching speakers',
    (initialTakeId) => {
      render(<DemoClonePlayer {...props} initialTakeId={initialTakeId} />);
      for (const speaker of ['heike', 'kat']) {
        fireEvent.click(screen.getByTestId(`demo-clone-speaker-${speaker}`));
        expect(screen.getByTestId('demo-clone-result')).toHaveAttribute(
          'data-take-id',
          initialTakeId,
        );
        expect(audio().getAttribute('src')).toBe(
          `/demo-clones/voxtral-3/${speaker}-${initialTakeId}.mp3`,
        );
      }
    },
  );

  it.each(['kat', 'heike'])(
    'shows tags inline without autoplay and preserves %s’s sentence across takes',
    (speakerId) => {
      render(<DemoClonePlayer {...props} initialSpeakerId={speakerId} />);
      expect(screen.getByTestId('demo-clone-result')).toHaveAttribute(
        'data-take-id',
        'natural',
      );
      const quote = screen.getByTestId('demo-clone-script');
      const sentence = quote.textContent;
      for (const [take, tags] of [
        ['sarcastic', '[emotion=sarcastic]'],
        ['calmSlow', '[emotion=calm][pace=slow]'],
        ['natural', ''],
      ]) {
        selectTake(take);
        expect(audio().getAttribute('src')).toBe(
          `/demo-clones/voxtral-3/${speakerId}-${take}.mp3`,
        );
        expect(quote).toBeVisible();
        if (tags) expect(quote).toHaveTextContent(tags);
        else expect(quote.textContent).not.toContain('[');
        expect(quote.textContent?.replace(/\[[^\]]*\]\s*/g, '')).toBe(sentence);
        expect(
          document.querySelector('details, summary'),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByTestId('demo-clone-prompt'),
        ).not.toBeInTheDocument();
      }
      expect(play).not.toHaveBeenCalled();
    },
  );

  it('highlights emotion and pace tags without changing the prompt text', () => {
    render(<DemoClonePlayer {...props} initialTakeId="calmSlow" />);
    for (const tag of ['[emotion=calm]', '[pace=slow]']) {
      expect(screen.getByText(tag, { exact: true })).toHaveClass(
        'bg-primary/20',
        'text-blue-300',
        'align-baseline',
      );
      expect(screen.getByText(tag, { exact: true })).not.toHaveClass(
        'text-sm',
        'font-mono',
        'align-middle',
      );
    }
    expect(screen.getByTestId('demo-clone-script').textContent).toBe(
      "“Oh, [emotion=calm][pace=slow]you're here just when I was thinking about you.”",
    );
    selectTake('natural');
    expect(screen.queryByText('[emotion=calm]')).not.toBeInTheDocument();
    expect(screen.queryByText('[pace=slow]')).not.toBeInTheDocument();
  });

  it.each(['sameOriginal', 'natural', 'sarcastic', 'calmSlow'] as const)(
    'groups the entire %s prompt for selection without quotation marks',
    (initialTakeId) => {
      render(<DemoClonePlayer {...props} initialTakeId={initialTakeId} />);
      const prompt = screen.getByTestId('demo-clone-prompt-text');
      expect(prompt).toHaveClass('select-all');
      expect(prompt.textContent).not.toMatch(/[“”]/);
      const quotes = screen
        .getByTestId('demo-clone-script')
        .querySelectorAll('[aria-hidden="true"]');
      expect(quotes).toHaveLength(2);
      for (const quote of quotes) expect(quote).toHaveClass('select-none');
    },
  );

  it('renders the shared waveform against the native audio element', () => {
    render(<DemoClonePlayer {...props} />);
    expect(vi.mocked(WavesurferPlayer).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        barGap: 2,
        barRadius: 2,
        barWidth: 2,
        cursorColor: 'transparent',
        height: 48,
        interact: false,
        media: audio(),
        progressColor: '#7c3aed',
        waveColor: '#a1a1aa',
      }),
    );
    expect(document.querySelectorAll('audio')).toHaveLength(1);
    expect(screen.getByTestId('demo-clone-play')).toHaveAttribute(
      'data-variant',
      'secondary',
    );
  });

  it('seeks through the waveform and updates the time display', () => {
    render(<DemoClonePlayer {...props} />);
    fireEvent.change(screen.getByRole('slider', { name: labels.seek }), {
      target: { value: '2' },
    });
    expect(audio().currentTime).toBe(2);
    expect(screen.getByText(/^0:02 \/ /)).toBeInTheDocument();
    selectTake('sarcastic');
    expect(audio().currentTime).toBe(0);
    expect(screen.getByRole('slider')).toHaveValue('0');
    expect(screen.getByTestId('audio-waveform')).toHaveAttribute(
      'data-url',
      expect.stringContaining('kat-sarcastic.mp3'),
    );
  });

  it('pauses at the current position and resumes the same clip', async () => {
    render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    await screen.findByLabelText(labels.pauseAudio);
    audio().currentTime = 1;
    fireEvent.timeUpdate(audio());
    fireEvent.click(screen.getByLabelText(labels.pauseAudio));
    expect(pause).toHaveBeenCalled();
    expect(audio().currentTime).toBe(1);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it('stops playing when the voice or delivery changes', async () => {
    const { unmount } = render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    await screen.findByLabelText(labels.pauseAudio);
    audio().currentTime = 1;
    selectTake('calmSlow');
    expect(audio().currentTime).toBe(0);
    fireEvent.click(screen.getByTestId('demo-clone-speaker-heike'));
    expect(audio().getAttribute('src')).toContain('heike-calmSlow.mp3');
    expect(screen.getByTestId('demo-clone-try')).toHaveAttribute(
      'href',
      '/dashboard/clone?demo=heike&take=calmSlow',
    );
    expect(play).toHaveBeenCalledOnce();
    const before = pause.mock.calls.length;
    unmount();
    expect(pause.mock.calls.length).toBeGreaterThan(before);
  });

  it('ignores a play promise rejected after changing the selection', async () => {
    let rejectPlay: (error: Error) => void = () => {};
    play.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPlay = reject;
        }),
    );
    render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    selectTake('sarcastic');
    await act(async () =>
      rejectPlay(new DOMException('interrupted', 'AbortError')),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(labels.playAudio)).toBeInTheDocument();
  });

  it('plays the original through the same element and returns to the selected take', async () => {
    render(<DemoClonePlayer {...props} />);
    selectTake('sarcastic');
    const element = audio();
    fireEvent.click(screen.getByText(labels.hearOriginal));
    await screen.findByLabelText(labels.pauseAudio);
    expect(audio()).toBe(element);
    expect(audio().getAttribute('src')).toContain('kat-reference.mp3');
    expect(screen.getByTestId('audio-waveform')).toHaveAttribute(
      'data-url',
      expect.stringContaining('kat-reference.mp3'),
    );
    fireEvent.click(screen.getByText(labels.backToClone));
    await screen.findByLabelText(labels.pauseAudio);
    expect(audio().getAttribute('src')).toContain('kat-sarcastic.mp3');
  });

  it('offers retry on a real playback failure', async () => {
    play.mockRejectedValueOnce(
      new DOMException('No audio', 'NotSupportedError'),
    );
    render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByLabelText(labels.playAudio));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      labels.audioError,
    );
    fireEvent.click(screen.getByText(labels.retry));
    await screen.findByLabelText(labels.pauseAudio);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reloads the waveform when retrying a decode failure', async () => {
    render(<DemoClonePlayer {...props} />);
    const waveform = screen.getByTestId('audio-waveform');
    const waveformProps = vi.mocked(WavesurferPlayer).mock.lastCall?.[0];
    act(() => {
      waveformProps?.onError?.(
        {} as Parameters<NonNullable<typeof waveformProps.onError>>[0],
        new Error('Decode failed'),
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent(labels.audioError);
    fireEvent.click(screen.getByText(labels.retry));
    await screen.findByLabelText(labels.pauseAudio);
    expect(screen.getByTestId('audio-waveform')).not.toBe(waveform);
    expect(audio().getAttribute('src')).toContain('kat-natural.mp3');
  });

  it('uses a signup CTA publicly and an apply action in the dashboard', () => {
    const { rerender } = render(<DemoClonePlayer {...props} />);
    expect(
      screen.getByRole('link', { name: labels.signUpAndClone }),
    ).toHaveAttribute('href', '/dashboard/clone?demo=kat&take=natural');
    rerender(<DemoClonePlayer {...props} onTryVoice={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: labels.tryVoice }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: labels.signUpAndClone }),
    ).not.toBeInTheDocument();
  });

  it.each(['sameOriginal', 'natural', 'sarcastic', 'calmSlow'] as const)(
    'passes the exact %s delivery to the dashboard action',
    (takeId) => {
      const onTryVoice = vi.fn();
      const { rerender } = render(
        <DemoClonePlayer {...props} onTryVoice={onTryVoice} />,
      );
      selectTake(takeId);
      fireEvent.click(screen.getByTestId('demo-clone-try'));
      expect(onTryVoice).toHaveBeenCalledExactlyOnceWith('kat', takeId);
      rerender(<DemoClonePlayer {...props} applying onTryVoice={onTryVoice} />);
      expect(screen.getByTestId('demo-clone-try')).toBeDisabled();
    },
  );
});
