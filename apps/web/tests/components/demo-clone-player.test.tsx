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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoClonePlayer } from '@/components/demo-clone/demo-clone-player';
import { NativeAudioWaveform } from '@/components/native-audio-waveform';
import {
  DEMO_LANGUAGE_CODES,
  type DemoLanguageCode,
  getDemoCloneLanguages,
  getDemoCloneSpeaker,
} from '@/data/demo-clone';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import messages from '@/messages/en.json';

vi.mock('@/components/native-audio-waveform', () => ({
  NativeAudioWaveform: vi.fn(({ url }: { url: string }) => (
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
  languageLabels: Object.fromEntries(
    getTranslatedLanguages('en', DEMO_LANGUAGE_CODES).map(
      ({ value, label }) => [value, label],
    ),
  ) as Record<DemoLanguageCode, string>,
};
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(NativeAudioWaveform).mockClear();
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
const selectLanguage = (value: string) => {
  const previousAudio = audio();
  fireEvent.change(screen.getByTestId('demo-clone-language'), {
    target: { value },
  });
  if (previousAudio && audio() === previousAudio)
    fireEvent.loadedMetadata(previousAudio);
};
const selectTake = (id: string) => {
  const previousAudio = audio();
  fireEvent.click(
    document.querySelector(`input[name="demo-clone-take"][value="${id}"]`)!,
  );
  if (previousAudio && audio() === previousAudio)
    fireEvent.loadedMetadata(previousAudio);
};

describe('Hear the difference', () => {
  it.each([
    ['en', 'en'],
    ['de-DE', 'de'],
    ['es', 'es'],
    ['fr', 'fr'],
    ['it-IT', 'it'],
    ['nl', 'nl'],
    ['pt', 'pt'],
    ['ar', 'ar'],
    ['hi', 'hi'],
    ['da', 'en'],
  ])('orders and selects the route language %s as %s', (locale, expected) => {
    render(<DemoClonePlayer {...props} locale={locale} />);
    const select = screen.getByRole('combobox', { name: labels.pickLanguage });
    expect(select).toBe(screen.getByTestId('demo-clone-language'));
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveValue(expected);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(9);
    expect(
      options.map((option) => (option as HTMLOptionElement).value),
    ).toEqual([
      expected,
      ...DEMO_LANGUAGE_CODES.filter((code) => code !== expected),
    ]);
    for (const option of options) expect(option).toBeEnabled();
    expect(
      document.querySelector('input[name="demo-clone-speaker"]'),
    ).toBeNull();
  });

  it('uses the route locale rather than the browser language', () => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('de-DE');
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    render(<DemoClonePlayer {...props} locale="fr" />);
    expect(screen.getByTestId('demo-clone-language')).toHaveValue('fr');
    expect(screen.getByTestId('demo-clone-pending')).toBeVisible();
    expect(document.querySelector('audio')).toBeNull();
  });

  it.each(['it', 'es', 'fr', 'nl', 'pt', 'ar', 'hi'])(
    'shows only the planned %s prompt without fabricated audio or actions',
    (locale) => {
      render(<DemoClonePlayer {...props} locale={locale} />);
      const planned = getDemoCloneLanguages(locale)[0];
      expect(planned.speaker).toBeNull();
      expect(screen.getByTestId('demo-clone-prompt-text').textContent).toBe(
        planned.prompt,
      );
      expect(screen.getByTestId('demo-clone-prompt-text')).toHaveClass(
        'select-all',
      );
      expect(
        screen.getByText('[emotion=anxious]', { exact: true }),
      ).toHaveClass('bg-primary/20');
      expect(screen.getByTestId('demo-clone-script')).toHaveAttribute(
        'lang',
        locale,
      );
      expect(screen.getByTestId('demo-clone-pending')).toHaveAttribute(
        'role',
        'status',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        labels.samplePending,
      );
      expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
        labels.comingSoon,
      );
      expect(document.querySelector('audio, img')).toBeNull();
      expect(screen.queryByTestId('audio-waveform')).not.toBeInTheDocument();
      expect(screen.queryByTestId('demo-clone-play')).not.toBeInTheDocument();
      expect(screen.queryByRole('slider')).not.toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(screen.queryByTestId('demo-clone-try')).not.toBeInTheDocument();
      expect(screen.queryByText(labels.hearOriginal)).not.toBeInTheDocument();
      expect(play).not.toHaveBeenCalled();
    },
  );

  it('renders the planned Arabic prompt right to left', () => {
    render(<DemoClonePlayer {...props} locale="ar" />);
    expect(screen.getByTestId('demo-clone-script')).toHaveAttribute(
      'dir',
      'rtl',
    );
  });

  it('shows an image only for the selected ready voice', () => {
    render(<DemoClonePlayer {...props} locale="en" />);
    expect(document.querySelectorAll('img')).toHaveLength(1);
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      '/demo-clones/kat.webp',
    );
    selectLanguage('de');
    expect(document.querySelectorAll('img')).toHaveLength(1);
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      '/demo-clones/heike.webp',
    );
    selectLanguage('it');
    expect(document.querySelector('img')).toBeNull();
  });

  it('stops playback on a pending selection and restores only real ready audio', async () => {
    render(<DemoClonePlayer {...props} />);
    fireEvent.click(screen.getByTestId('demo-clone-play'));
    await screen.findByLabelText(labels.pauseAudio);
    const previousAudio = audio();
    previousAudio.currentTime = 2;
    pause.mockClear();
    selectLanguage('it');
    expect(pause.mock.contexts).toContain(previousAudio);
    expect(document.querySelector('audio')).toBeNull();
    expect(screen.queryByTestId('demo-clone-try')).not.toBeInTheDocument();
    selectLanguage('de');
    expect(audio()).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/heike-natural.mp3',
    );
    expect(audio().currentTime).toBe(0);
    expect(screen.getByLabelText(labels.playAudio)).toBeInTheDocument();
    expect(screen.getByTestId('demo-clone-try')).toHaveAttribute(
      'href',
      '/dashboard/clone?demo=heike&take=natural',
    );
    expect(screen.getByTestId('demo-clone-prompt-text').textContent).toBe(
      'Ach, da bist du ja genau im richtigen Moment.',
    );
    expect(play).toHaveBeenCalledOnce();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a late play %s after selecting a pending language',
    async (outcome) => {
      let resolvePlay: () => void = () => {};
      let rejectPlay: (error: Error) => void = () => {};
      play.mockImplementationOnce(
        () =>
          new Promise<void>((resolve, reject) => {
            resolvePlay = resolve;
            rejectPlay = reject;
          }),
      );
      render(<DemoClonePlayer {...props} />);
      fireEvent.click(screen.getByTestId('demo-clone-play'));
      selectLanguage('fr');
      await act(async () => {
        if (outcome === 'resolve') resolvePlay();
        else rejectPlay(new DOMException('No audio', 'NotSupportedError'));
      });
      expect(screen.getByTestId('demo-clone-pending')).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(document.querySelector('audio')).toBeNull();
      selectLanguage('de');
      expect(screen.getByLabelText(labels.playAudio)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(audio()).toHaveAttribute(
        'src',
        '/demo-clones/voxtral-3/heike-natural.mp3',
      );
    },
  );

  it('pauses native audio on unmount after starting from a pending locale', async () => {
    const { unmount } = render(<DemoClonePlayer {...props} locale="it" />);
    selectLanguage('de');
    const element = audio();
    fireEvent.click(screen.getByTestId('demo-clone-play'));
    await screen.findByLabelText(labels.pauseAudio);
    pause.mockClear();
    unmount();
    expect(pause.mock.contexts).toContain(element);
  });

  it('offers the dashboard callback only for a real ready selection', () => {
    const onTryVoice = vi.fn();
    render(<DemoClonePlayer {...props} locale="it" onTryVoice={onTryVoice} />);
    expect(screen.queryByTestId('demo-clone-try')).not.toBeInTheDocument();
    expect(onTryVoice).not.toHaveBeenCalled();
    selectLanguage('de');
    selectTake('calmSlow');
    fireEvent.click(screen.getByTestId('demo-clone-try'));
    expect(onTryVoice).toHaveBeenCalledExactlyOnceWith('heike', 'calmSlow');
    selectLanguage('fr');
    expect(screen.queryByTestId('demo-clone-try')).not.toBeInTheDocument();
    expect(onTryVoice).toHaveBeenCalledOnce();
  });
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
    selectLanguage('en');
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
    selectLanguage('de');
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
    selectLanguage('en');
    expect(screen.getByRole('radio', { name: labels.natural })).toBeChecked();
  });

  it.each(['natural', 'sarcastic', 'calmSlow'] as const)(
    'preserves the supported %s take when switching speakers',
    (initialTakeId) => {
      render(<DemoClonePlayer {...props} initialTakeId={initialTakeId} />);
      for (const speaker of ['heike', 'kat']) {
        selectLanguage(speaker === 'heike' ? 'de' : 'en');
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
    expect(vi.mocked(NativeAudioWaveform).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        duration: expect.any(Number),
        interact: false,
        media: audio(),
        url: audio().src,
        peaks: getDemoCloneSpeaker('kat').takes.find(
          (take) => take.id === 'natural',
        )!.peaks,
        ready: true,
        reloadKey: 0,
      }),
    );
    expect(document.querySelectorAll('audio')).toHaveLength(1);
    expect(screen.getByTestId('demo-clone-play')).toHaveAttribute(
      'data-variant',
      'secondary',
    );
  });

  it('keeps the waveform mounted while waiting for matching native metadata', () => {
    render(<DemoClonePlayer {...props} />);
    const element = audio();
    const originalUrl = element.src;
    const currentSrc = vi
      .spyOn(element, 'currentSrc', 'get')
      .mockReturnValue(originalUrl);
    const previousWaveform = screen.getByTestId('audio-waveform');
    vi.mocked(NativeAudioWaveform).mockClear();

    fireEvent.click(screen.getByRole('radio', { name: labels.sarcastic }));

    expect(audio()).toBe(element);
    expect(element).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/kat-sarcastic.mp3',
    );
    expect(element.currentSrc).toBe(originalUrl);
    expect(screen.getByTestId('audio-waveform')).toBe(previousWaveform);
    expect(vi.mocked(NativeAudioWaveform).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        media: element,
        url: element.src,
        ready: false,
      }),
    );
    fireEvent.loadedMetadata(element);
    expect(screen.getByTestId('audio-waveform')).toBe(previousWaveform);
    expect(vi.mocked(NativeAudioWaveform).mock.lastCall?.[0]?.ready).toBe(
      false,
    );

    currentSrc.mockReturnValue(element.src);
    fireEvent.loadedMetadata(element);

    expect(screen.getByTestId('audio-waveform')).toBe(previousWaveform);
    expect(screen.getByTestId('audio-waveform')).toHaveAttribute(
      'data-url',
      element.src,
    );
    expect(vi.mocked(NativeAudioWaveform).mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        media: element,
        url: element.src,
        ready: true,
        peaks: getDemoCloneSpeaker('kat').takes.find(
          (take) => take.id === 'sarcastic',
        )!.peaks,
      }),
    );
    expect(audio()).toBe(element);
    expect(element).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/kat-sarcastic.mp3',
    );
    expect(play).not.toHaveBeenCalled();
  });

  it('passes each real clip’s cached peaks without remounting across takes, references, and ready voices', async () => {
    render(<DemoClonePlayer {...props} />);
    const waveform = screen.getByTestId('audio-waveform');
    const element = audio();
    for (const speakerId of ['kat', 'heike']) {
      const speaker = getDemoCloneSpeaker(speakerId);
      selectLanguage(speaker.languageCode);
      for (const take of speaker.takes) {
        selectTake(take.id);
        const waveformProps = vi.mocked(NativeAudioWaveform).mock.lastCall?.[0];
        expect(screen.getByTestId('audio-waveform')).toBe(waveform);
        expect(audio()).toBe(element);
        expect(take.peaks.length).toBeGreaterThan(0);
        expect(waveformProps?.peaks).toBe(take.peaks);
        expect(waveformProps).toEqual(
          expect.objectContaining({
            duration: take.durationSeconds,
            url: element.src,
            media: element,
            ready: true,
          }),
        );
        expect(element).toHaveAttribute('src', take.src);
      }
      fireEvent.click(screen.getByText(labels.hearOriginal));
      await screen.findByLabelText(labels.pauseAudio);
      fireEvent.loadedMetadata(element);
      expect(screen.getByTestId('audio-waveform')).toBe(waveform);
      expect(speaker.reference.peaks.length).toBeGreaterThan(0);
      expect(vi.mocked(NativeAudioWaveform).mock.lastCall?.[0]?.peaks).toBe(
        speaker.reference.peaks,
      );
      expect(vi.mocked(NativeAudioWaveform).mock.lastCall?.[0]).toEqual(
        expect.objectContaining({
          duration: speaker.reference.durationSeconds,
          url: element.src,
          media: element,
          ready: true,
        }),
      );
      expect(element).toHaveAttribute('src', speaker.reference.src);
      fireEvent.click(screen.getByText(labels.backToClone));
      await screen.findByLabelText(labels.pauseAudio);
      fireEvent.loadedMetadata(element);
      expect(screen.getByTestId('audio-waveform')).toBe(waveform);
      expect(vi.mocked(NativeAudioWaveform).mock.lastCall?.[0]?.peaks).toBe(
        speaker.takes.at(-1)!.peaks,
      );
    }
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
    selectLanguage('de');
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
    fireEvent.loadedMetadata(element);
    expect(screen.getByTestId('audio-waveform')).toHaveAttribute(
      'data-url',
      expect.stringContaining('kat-reference.mp3'),
    );
    fireEvent.click(screen.getByText(labels.backToClone));
    await screen.findByLabelText(labels.pauseAudio);
    expect(audio().getAttribute('src')).toContain('kat-sarcastic.mp3');
    fireEvent.loadedMetadata(element);
    expect(screen.getByTestId('audio-waveform')).toHaveAttribute(
      'data-url',
      expect.stringContaining('kat-sarcastic.mp3'),
    );
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

  it('increments the reload key without remounting the waveform on retry', async () => {
    render(<DemoClonePlayer {...props} />);
    const waveform = screen.getByTestId('audio-waveform');
    const waveformProps = vi.mocked(NativeAudioWaveform).mock.lastCall?.[0];
    act(() => {
      waveformProps?.onError?.(new Error('Decode failed'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(labels.audioError);
    fireEvent.click(screen.getByText(labels.retry));
    await screen.findByLabelText(labels.pauseAudio);
    expect(screen.getByTestId('audio-waveform')).toBe(waveform);
    expect(vi.mocked(NativeAudioWaveform).mock.lastCall?.[0]?.reloadKey).toBe(
      (waveformProps?.reloadKey ?? 0) + 1,
    );
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
