// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioGenerator } from '@/components/audio-generator';

const mockToastFn = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
  }),
);
const mockJoinSegments = vi.hoisted(() =>
  vi.fn(async () => new Blob(['joined'], { type: 'audio/mpeg' })),
);

vi.mock('@ai-sdk/react', () => ({
  useCompletion: () => ({
    complete: vi.fn(),
  }),
}));

vi.mock('@/app/[lang]/tools/audio-joiner/hooks/use-ffmpeg-joiner', () => ({
  useFFmpegJoiner: () => ({
    cancel: vi.fn(),
    error: null,
    isLoading: false,
    isProcessing: false,
    join: mockJoinSegments,
    progress: 0,
  }),
}));

vi.mock('@/components/audio-provider', () => ({
  useAudio: () => ({
    reset: vi.fn(),
  }),
}));

vi.mock('@/components/services/toast', () => ({
  toast: mockToastFn,
}));

vi.mock('@/components/audio-player-with-context', () => ({
  AudioPlayerWithContext: ({ url }: { url: string }) => (
    <div data-testid="audio-player" data-url={url} />
  ),
}));

vi.mock('@/components/streaming-waveform-player', () => ({
  StreamingWaveformPlayer: ({
    controller,
  }: {
    controller: { phase: string };
  }) => (
    <div
      data-phase={controller.phase}
      data-testid="streaming-waveform-player"
    />
  ),
}));

vi.mock('@/components/grok-tts-editor', () => ({
  GrokTTSEditor: ({
    charactersLimit,
    enforceCharactersLimit = true,
    onChange,
    placeholder,
    selectedGrokLanguage,
    setSelectedGrokLanguage,
    value,
  }: {
    charactersLimit: number;
    enforceCharactersLimit?: boolean;
    onChange: (text: string) => void;
    placeholder?: string;
    selectedGrokLanguage: string;
    setSelectedGrokLanguage: (text: string) => void;
    value: string;
  }) => (
    <>
      <div className="space-y-2 sm:w-1/3">
        <label className="font-medium text-sm" htmlFor="grok-language">
          Language
        </label>
        <select
          id="grok-language"
          onChange={(event) =>
            setSelectedGrokLanguage(event.currentTarget.value)
          }
          value={selectedGrokLanguage}
        >
          <option value="auto">Automatic</option>
          <option value="en">English</option>
          <option value="ar-EG">Arabic (Egypt)</option>
          <option value="ar-SA">Arabic (Saudi Arabia)</option>
        </select>
      </div>
      <textarea
        aria-label={placeholder}
        maxLength={enforceCharactersLimit ? charactersLimit : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
      <button type="button">Insert tags</button>
    </>
  ),
}));

vi.mock('@/lib/ai', () => ({
  estimateTokenCount: vi.fn((text: string) => Math.ceil(text.length / 4)),
  GEMINI_CHARS_PER_TOKEN: 4,
  GEMINI_STREAMING_ENABLED: false,
  getCharactersLimit: vi.fn((model?: string, isPaidUser?: boolean) => {
    if (model === 'gpro') {
      return isPaidUser ? 1000 : 500;
    }

    if (model === 'xai') {
      return isPaidUser ? 1000 : 500;
    }

    return 500;
  }),
  getGeminiCombinedTokenLimit: vi.fn((isPaidUser?: boolean) =>
    isPaidUser ? 8192 : 400,
  ),
  getGeminiStyleCharacterLimit: vi.fn((isPaidUser?: boolean) =>
    isPaidUser ? 2500 : 1000,
  ),
}));

vi.mock('@/lib/download', () => ({
  downloadUrl: vi.fn(),
}));

vi.mock('@/lib/react-textarea-autosize', () => ({
  resizeTextarea: vi.fn(),
}));

const baseDict = {
  cancel: 'Cancel',
  ctaButton: 'Generate',
  ctaButtonPlural: 'Generate audios',
  dailyLimitError: 'Daily limit reached (__COUNT__)',
  downloadAudio: 'Download audio',
  enhanceTextTitle: 'Enhance text with AI emotion tags',
  error: 'Something went wrong',
  errorEstimating: 'Failed to estimate credits',
  estimateCreditsButton: 'Estimate credits',
  fullscreenTitle: 'Fullscreen',
  generating: 'Generating',
  grok: {
    effects: {
      breath: 'Breath',
      chuckle: 'Chuckle',
      cry: 'Cry',
      exhale: 'Exhale',
      giggle: 'Giggle',
      humTune: 'Hum tune',
      inhale: 'Inhale',
      laugh: 'Laugh',
      lipSmack: 'Lip smack',
      longPause: 'Long pause',
      pause: 'Pause',
      sigh: 'Sigh',
      tongueClick: 'Tongue click',
      tsk: 'Tsk',
    },
    formatPlaceholder: 'Select format',
    helperText: 'Use Grok tags to control delivery.',
    inlineEffectPlaceholder: 'Insert tags',
    langArabicEgypt: 'Arabic (Egypt)',
    langArabicSaudiArabia: 'Arabic (Saudi Arabia)',
    langArabicUnitedArabEmirates: 'Arabic (United Arab Emirates)',
    langAutomatic: 'Automatic',
    langBengali: 'Bengali',
    langChinese: 'Chinese',
    langEnglish: 'English',
    langFrench: 'French',
    langGerman: 'German',
    langHindi: 'Hindi',
    langIndonesian: 'Indonesian',
    langItalian: 'Italian',
    langJapanese: 'Japanese',
    langKorean: 'Korean',
    langPortugueseBrazil: 'Portuguese (Brazil)',
    langPortuguesePortugal: 'Portuguese (Portugal)',
    langRussian: 'Russian',
    langSpanishMexico: 'Spanish (Mexico)',
    langSpanishSpain: 'Spanish (Spain)',
    langTurkish: 'Turkish',
    languageLabel: 'Language',
    languageSelectPlaceholder: 'Select a language',
    langVietnamese: 'Vietnamese',
    wrappingEffectPlaceholder: 'Wrap selected text',
  },
  langAutomatic: 'Automatic',
  languageLabel: 'Language',
  languageSelectPlaceholder: 'Select a language',
  notEnoughCredits: 'Not enough credits',
  paidCharacterLimitTooltip: 'Paid users enjoy 2× character limit',
  playAudio: 'Play audio',
  resetPlayer: 'Reset player',
  split: {
    downloadAll: 'Download all',
    downloadAllFailed: 'Failed to download all segments',
    joiningWav: 'Joining audio',
    preparingJoiner: 'Preparing joiner',
    progressSegment: 'Segment __CURRENT__/__TOTAL__',
    progressTitle: 'Audio generation',
    progressTitleWithVoice: '__VOICE__ generation',
    retry: 'Retry',
    segmentCannotBeEmpty: 'Segment cannot be empty',
    segmentFailed: 'Segment __INDEX__ failed',
    segmentGenerated: 'Segment __INDEX__ generated',
    segmentLabel: 'Segment __INDEX__',
    segmentPreviews: 'Segment previews',
    segmentRetryFailed: 'Retry failed for segment __INDEX__',
    splitToggleDisabled: 'Split text audios is available for paid users.',
    splitToggleLabel: 'Split long text',
    statusFailed: 'Failed',
    statusGenerated: 'Generated',
    statusGenerating: 'Generating',
    statusPending: 'Pending',
    tooManySegments:
      'Split text can have at most __COUNT__ segments. Shorten the text or combine segments before generating.',
  },
  success: 'Success',
  textAreaPlaceholder: 'Enter text',
  title: 'Generate audio',
  upgradeCharacterLimitTooltip: 'Upgrade to a paid plan for 2× character limit',
} as const;

function createVoice(
  overrides: Partial<Tables<'voices'>> = {},
): Tables<'voices'> {
  return {
    created_at: null,
    description: null,
    feature: 'tts',
    id: 'voice-id',
    language: 'en',
    model:
      'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
    name: 'tara',
    sample_prompt: null,
    sample_url: null,
    sort_order: 0,
    type: null,
    user_id: null,
    ...overrides,
  } as Tables<'voices'>;
}

function renderAudioGenerator(
  overrides: Partial<React.ComponentProps<typeof AudioGenerator>> = {},
) {
  const defaultProps: React.ComponentProps<typeof AudioGenerator> = {
    hasEnoughCredits: true,
    isPaidUser: true,
    selectedStyle: 'moan softly',
    selectedVoice: createVoice(),
  };

  return render(
    <NextIntlClientProvider locale="en" messages={{ generate: baseDict }}>
      <AudioGenerator {...defaultProps} {...overrides} />
    </NextIntlClientProvider>,
  );
}

function ensureLocalStorage() {
  if (typeof window.localStorage.clear === 'function') {
    return;
  }

  const storage = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
}

function stubAudioMetadata(duration = 1) {
  class MockAudio {
    duration = duration;
    private readonly listeners = new Map<string, EventListener>();

    addEventListener(type: string, listener: EventListener) {
      this.listeners.set(type, listener);
    }

    removeEventListener(type: string) {
      this.listeners.delete(type);
    }

    load() {
      this.listeners.get('loadedmetadata')?.(new Event('loadedmetadata'));
    }
  }

  vi.stubGlobal('Audio', MockAudio);
}

function getFetchRequestBody(
  fetchMock: ReturnType<typeof vi.fn>,
  index: number,
) {
  const request = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  expect(request).toBeDefined();
  return JSON.parse(String(request?.body));
}

describe('AudioGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastFn.mockClear();
    mockToastFn.success.mockClear();
    mockToastFn.error.mockClear();
    mockToastFn.loading.mockClear();
    mockToastFn.dismiss.mockClear();
    ensureLocalStorage();
    window.localStorage.clear();

    let uuidCounter = 0;
    Object.assign(globalThis.crypto, {
      randomUUID: vi.fn(() => `segment-${++uuidCounter}`),
    });
  });

  it('shows the Grok language selector with Automatic first and English second', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    const languageLabel = screen.getByText(baseDict.languageLabel);
    expect(languageLabel).toBeInTheDocument();

    const languageField = languageLabel.parentElement;
    expect(languageField).not.toBeNull();

    const trigger = within(languageField as HTMLElement).getByRole('combobox');
    expect(trigger).toHaveDisplayValue(baseDict.langAutomatic);

    const options = within(languageField as HTMLElement).getAllByRole('option');
    expect(options[0]).toHaveTextContent(baseDict.langAutomatic);
    expect(options[1]).toHaveTextContent('English');
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          textContent: expect.stringContaining('Arabic (Egypt)'),
        }),
        expect.objectContaining({
          textContent: expect.stringContaining('Arabic (Saudi Arabia)'),
        }),
      ]),
    );
  });

  it('submits the selected Grok language in the generation request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: 'https://example.com/audio.mp3' }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    const languageLabel = screen.getByText(baseDict.languageLabel);
    const languageField = languageLabel.parentElement;
    expect(languageField).not.toBeNull();

    const trigger = within(languageField as HTMLElement).getByRole('combobox');
    await user.selectOptions(trigger, 'ar-EG');

    await waitFor(() => {
      expect(trigger).toHaveDisplayValue('Arabic (Egypt)');
    });

    const editor = screen.getByRole('textbox', {
      name: baseDict.textAreaPlaceholder,
    });
    await user.click(editor);
    await user.keyboard('مرحبا');

    await waitFor(() =>
      expect(screen.getByTestId('generate-button')).toBeEnabled(),
    );

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/generate-voice');
    expect(request).toEqual(
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.parse(String(request?.body))).toEqual({
      language: 'ar-EG',
      split: false,
      styleVariant: '',
      text: 'مرحبا',
      voiceId: 'voice-id',
    });
  });

  it('shows estimate credits UI for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    expect(
      screen.getByRole('button', { name: baseDict.estimateCreditsButton }),
    ).toBeInTheDocument();
  });

  it('hides the AI enhance button for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    expect(
      screen.queryByTitle('Enhance text with AI emotion tags'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('This model supports emotion tags'),
    ).not.toBeInTheDocument();
  });

  it('shows Grok TTS editor for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    expect(
      screen.getByRole('button', { name: /insert tags/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
    ).toBeInTheDocument();
    // Codec selector is handled outside the editor and may not expose a combobox here
  });

  it('does not show Grok TTS editor for Replicate voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
        name: 'tara',
      }),
    });

    expect(
      screen.queryByRole('button', { name: /insert tags/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps rapid native-textarea deletion local', async () => {
    const user = userEvent.setup();

    renderAudioGenerator();

    const textarea = await screen.findByPlaceholderText(
      baseDict.textAreaPlaceholder,
    );
    const prompt = 'Delete this quickly';

    await user.type(textarea, prompt);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    for (const _character of prompt) {
      await user.keyboard('{Backspace}');
    }

    expect(textarea).toHaveValue('');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('enables split mode for paid Replicate users and shows segment previews', async () => {
    const user = userEvent.setup();
    const longText = `${'A'.repeat(300)}. ${'B'.repeat(300)}.`;

    renderAudioGenerator();

    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      {
        target: { value: longText },
      },
    );

    expect(screen.getByTestId('generate-button')).toHaveTextContent(
      baseDict.ctaButton,
    );

    await user.click(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    expect(screen.getByTestId('generate-button')).toHaveTextContent(
      baseDict.ctaButtonPlural,
    );
    expect(screen.getByText('603 chars -> 2 segments')).toBeInTheDocument();
    expect(screen.getByText('Segment 1')).toBeInTheDocument();
    expect(screen.getByText('Segment 2')).toBeInTheDocument();
  });

  it('does not show a single split segment for text below the split threshold', async () => {
    const user = userEvent.setup();
    const shortText = 'Short text that should generate as one audio.';
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: 'https://example.com/audio.mp3' }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator();

    const input = await screen.findByPlaceholderText(
      baseDict.textAreaPlaceholder,
    );
    await user.type(input, shortText);
    await user.click(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    );

    expect(
      screen.queryByText(baseDict.split.segmentPreviews),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Segment 1')).not.toBeInTheDocument();
    expect(screen.getByTestId('generate-button')).toHaveTextContent(
      baseDict.ctaButton,
    );

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      split: false,
      styleVariant: '',
      text: shortText,
      voiceId: 'voice-id',
    });
    // A single segment doesn't warrant a progress modal.
    expect(mockToastFn.loading).not.toHaveBeenCalled();
  });

  it('does not show the progress modal for non-split single generation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: 'https://example.com/audio.mp3' }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator();

    const input = await screen.findByPlaceholderText(
      baseDict.textAreaPlaceholder,
    );
    await user.type(input, 'A short single generation prompt.');

    // Split is disabled by default, so this is a plain single generation.
    expect(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    ).not.toBeChecked();

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
    expect(mockToastFn.loading).not.toHaveBeenCalled();
  });

  it('disables split mode for free users', () => {
    renderAudioGenerator({
      isPaidUser: false,
      selectedVoice: createVoice({ model: 'gpro', name: 'achernar' }),
    });

    expect(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    ).toBeDisabled();
    expect(
      screen.getByPlaceholderText(baseDict.textAreaPlaceholder),
    ).toHaveAttribute('maxlength', '510');
  });

  it('removes the paid non-Grok character limit when split audios is enabled', async () => {
    const user = userEvent.setup();

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro', name: 'achernar' }),
    });

    const input = screen.getByPlaceholderText(baseDict.textAreaPlaceholder);
    expect(input).toHaveAttribute('maxlength', '1010');

    await user.click(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    );

    expect(input).not.toHaveAttribute('maxlength');
    expect(
      screen.queryByText(baseDict.split.segmentPreviews),
    ).not.toBeInTheDocument();
  });

  it('enables split mode for paid Grok users', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    expect(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    ).toBeEnabled();
  });

  it('removes the paid Grok character limit when split audios is enabled', async () => {
    const user = userEvent.setup();

    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    const input = screen.getByRole('textbox', {
      name: baseDict.textAreaPlaceholder,
    });
    expect(input).toHaveAttribute('maxlength', '1000');

    await user.click(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    );

    expect(input).not.toHaveAttribute('maxlength');
  });

  it('generates each Replicate split segment separately', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/segment-1.mp3' }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/segment-2.mp3' }),
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator();

    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      {
        target: { value: longText },
      },
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      split: true,
      styleVariant: '',
      text: firstSegment,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      split: true,
      styleVariant: '',
      text: secondSegment,
      voiceId: 'voice-id',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
    // Multiple segments show the progress modal, reaching completion on the
    // final segment.
    expect(mockToastFn.loading).toHaveBeenCalled();
    expect(mockToastFn.dismiss).toHaveBeenCalled();
  });

  it('blocks split generation when the text creates more than 20 segments', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const tooManySegmentsText = Array.from(
      { length: 21 },
      (_, index) => `${String.fromCharCode(65 + index).repeat(300)}.`,
    ).join(' ');

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro', name: 'achernar' }),
    });

    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      { target: { value: tooManySegmentsText } },
    );
    await waitFor(() => {
      expect(screen.getByText('Segment 20')).toBeVisible();
    });
    expect(screen.queryByText('Segment 21')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('generate-button'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockToastFn.error).toHaveBeenCalledWith(
      'Split text can have at most 20 segments. Shorten the text or combine segments before generating.',
    );
    expect(mockToastFn.success).not.toHaveBeenCalled();
  });

  it('generates each Gemini split segment separately with the selected style', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/gemini-1.wav' }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/gemini-2.wav' }),
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'Read this in a dramatic whisper',
      selectedVoice: createVoice({
        model: 'gpro',
        name: 'achernar',
      }),
    });

    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      {
        target: { value: longText },
      },
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      split: true,
      styleVariant: 'Read this in a dramatic whisper',
      text: firstSegment,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      split: true,
      styleVariant: 'Read this in a dramatic whisper',
      text: secondSegment,
      voiceId: 'voice-id',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
  });

  it('generates Gemini split segments and stops on first failure', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      json: async () => ({ error: 'Server error' }),
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'calm',
      selectedVoice: createVoice({ model: 'gpro', name: 'achernar' }),
    });

    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(mockToastFn.error).toHaveBeenCalledWith('Server error (500)');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockToastFn.success).not.toHaveBeenCalled();
  });

  it('resets a retried split segment to pending when retry is aborted', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ error: 'Server error' }),
        ok: false,
        status: 500,
      })
      .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'calm',
      selectedVoice: createVoice({ model: 'gpro', name: 'achernar' }),
    });

    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(mockToastFn.error).toHaveBeenCalledWith('Server error (500)');
    });
    const retryButton = screen.getByRole('button', {
      name: baseDict.split.retry,
    });
    expect(retryButton).toBeVisible();

    mockToastFn.error.mockClear();
    await user.click(retryButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: baseDict.split.retry }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getAllByText(baseDict.split.statusPending).length).toBe(2);
    expect(mockToastFn.error).not.toHaveBeenCalled();
  });

  it('skips already-generated Gemini segments on re-run', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/gemini-1.wav' }),
        ok: true,
        status: 200,
      })
      .mockResolvedValueOnce({
        json: async () => ({ error: 'Server error' }),
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/gemini-2.wav' }),
        ok: true,
        status: 200,
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'dramatic',
      selectedVoice: createVoice({ model: 'gpro', name: 'achernar' }),
    });

    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(mockToastFn.error).toHaveBeenCalledWith('Server error (500)');
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    mockToastFn.error.mockClear();

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      split: true,
      styleVariant: 'dramatic',
      text: secondSegment,
      voiceId: 'voice-id',
    });
  });

  it('hides the progress modal when a re-run resolves to a single pending segment', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/gemini-1.wav' }),
        ok: true,
        status: 200,
      })
      .mockResolvedValueOnce({
        json: async () => ({ error: 'Server error' }),
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/gemini-2.wav' }),
        ok: true,
        status: 200,
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'dramatic',
      selectedVoice: createVoice({ model: 'gpro', name: 'achernar' }),
    });

    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    // First run: progress modal shows for the two-segment generation, then the
    // second segment fails.
    await user.click(screen.getByTestId('generate-button'));
    await waitFor(() => {
      expect(mockToastFn.error).toHaveBeenCalledWith('Server error (500)');
    });
    expect(mockToastFn.loading).toHaveBeenCalled();
    mockToastFn.loading.mockClear();
    mockToastFn.dismiss.mockClear();

    // Second run: only the previously-failed segment is generated. Because a
    // single pending segment doesn't warrant a progress indicator, the toast
    // must stay hidden.
    await user.click(screen.getByTestId('generate-button'));
    await waitFor(() => {
      expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mockToastFn.loading).not.toHaveBeenCalled();
  });

  it('regenerates cached Gemini split segments when the style changes', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const selectedVoice = createVoice({ model: 'gpro', name: 'achernar' });
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        url: `https://example.com/gemini-${fetchMock.mock.calls.length}.wav`,
      }),
      ok: true,
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const view = renderAudioGenerator({
      selectedStyle: 'dramatic',
      selectedVoice,
    });

    fireEvent.change(
      await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getAllByText(baseDict.split.statusGenerated)).toHaveLength(2);

    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ generate: baseDict }}>
        <AudioGenerator
          hasEnoughCredits
          isPaidUser
          selectedStyle="calm"
          selectedVoice={selectedVoice}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(baseDict.split.statusPending)).toHaveLength(2);
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    expect(getFetchRequestBody(fetchMock, 2)).toEqual({
      split: true,
      styleVariant: 'calm',
      text: firstSegment,
      voiceId: 'voice-id',
    });
    expect(getFetchRequestBody(fetchMock, 3)).toEqual({
      split: true,
      styleVariant: 'calm',
      text: secondSegment,
      voiceId: 'voice-id',
    });
  });

  it('generates Grok split segments with a specific language for all segments', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-fr-1.mp3' }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-fr-2.mp3' }),
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
    });

    const languageLabel = screen.getByText(baseDict.grok.languageLabel);
    const languageField = languageLabel.parentElement as HTMLElement;
    const trigger = within(languageField).getByRole('combobox');
    await user.selectOptions(trigger, 'en');

    fireEvent.change(
      screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      language: 'en',
      split: true,
      styleVariant: '',
      text: firstSegment,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      language: 'en',
      split: true,
      styleVariant: '',
      text: secondSegment,
      voiceId: 'voice-id',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
  });

  it('generates Grok split segments and stops on first failure', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      json: async () => ({ error: 'Rate limit exceeded' }),
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
    });

    fireEvent.change(
      screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(mockToastFn.error).toHaveBeenCalledWith(
        'Rate limit exceeded (500)',
      );
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockToastFn.success).not.toHaveBeenCalled();
  });

  it('skips already-generated Grok segments on re-run', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-1.mp3' }),
        ok: true,
        status: 200,
      })
      .mockResolvedValueOnce({
        json: async () => ({ error: 'Server error' }),
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-2.mp3' }),
        ok: true,
        status: 200,
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
    });

    fireEvent.change(
      screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));
    await waitFor(() => {
      expect(mockToastFn.error).toHaveBeenCalledWith('Server error (500)');
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    mockToastFn.error.mockClear();

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      language: 'auto',
      split: true,
      styleVariant: '',
      text: secondSegment,
      voiceId: 'voice-id',
    });
  });

  it('regenerates cached Grok split segments when the language changes', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        url: `https://example.com/grok-${fetchMock.mock.calls.length}.mp3`,
      }),
      ok: true,
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
    });

    const languageLabel = screen.getByText(baseDict.grok.languageLabel);
    const languageField = languageLabel.parentElement as HTMLElement;
    const trigger = within(languageField).getByRole('combobox');
    await user.selectOptions(trigger, 'en');

    fireEvent.change(
      screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
      { target: { value: longText } },
    );
    await user.click(
      screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
    );
    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getAllByText(baseDict.split.statusGenerated)).toHaveLength(2);

    await user.selectOptions(trigger, 'ar-EG');

    await waitFor(() => {
      expect(screen.getAllByText(baseDict.split.statusPending)).toHaveLength(2);
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    expect(getFetchRequestBody(fetchMock, 2)).toEqual({
      language: 'ar-EG',
      split: true,
      styleVariant: '',
      text: firstSegment,
      voiceId: 'voice-id',
    });
    expect(getFetchRequestBody(fetchMock, 3)).toEqual({
      language: 'ar-EG',
      split: true,
      styleVariant: '',
      text: secondSegment,
      voiceId: 'voice-id',
    });
  });

  it('downloads all generated Grok split segments as an mp3', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const grokAudioBlob = new Blob(['segment'], { type: 'audio/mpeg' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-1.mp3' }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-2.mp3' }),
        ok: true,
      })
      .mockResolvedValue({
        blob: async () => grokAudioBlob,
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);
    stubAudioMetadata();
    const createObjectURL = vi.fn(() => 'blob:joined-audio');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );

    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    fireEvent.change(
      screen.getByRole('textbox', {
        name: baseDict.textAreaPlaceholder,
      }),
      {
        target: { value: longText },
      },
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await user.click(
      screen.getByRole('button', { name: baseDict.split.downloadAll }),
    );

    await waitFor(() => {
      expect(mockJoinSegments).toHaveBeenCalledWith(expect.any(Array), 'mp3');
    });
    expect(createObjectURL).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'audio/mpeg' }),
    );
  });

  it('generates Grok split segments without breaking wrapping tags', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(260)}.`;
    const wrappedSegment = `<fast>${'B'.repeat(220)}. ${'C'.repeat(
      220,
    )}.</fast>`;
    const lastSegment = `${'D'.repeat(260)}.`;
    const longText = `${firstSegment} ${wrappedSegment} ${lastSegment}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-1.mp3' }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-2.mp3' }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ url: 'https://example.com/grok-3.mp3' }),
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'xai',
        name: 'eve',
      }),
    });

    fireEvent.change(
      screen.getByRole('textbox', {
        name: baseDict.textAreaPlaceholder,
      }),
      {
        target: { value: longText },
      },
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
    });
    expect(screen.getByText('Segment 1')).toBeInTheDocument();
    expect(screen.getByText('Segment 2')).toBeInTheDocument();
    expect(screen.getByText('Segment 3')).toBeInTheDocument();

    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      language: 'auto',
      split: true,
      styleVariant: '',
      text: firstSegment,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      language: 'auto',
      split: true,
      styleVariant: '',
      text: wrappedSegment,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      language: 'auto',
      split: true,
      styleVariant: '',
      text: lastSegment,
      voiceId: 'voice-id',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
  });

  // ── Streaming tests ───────────────────────────────────────────────────────

  function makeSseStreamResponse(frames: string[]) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        controller.close();
      },
    });
    return {
      body: readable,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      json: async () => ({}),
      ok: true,
    };
  }

  const R2_AUDIO_URL = 'https://files.sexyvoice.ai/generated-audio/kore.wav';
  // 4 zero bytes → 2 Int16 PCM samples → valid for Int16Array
  const SSE_AUDIO_FRAME =
    'event: audio\ndata: {"data":"AAAAAA==","mimeType":"audio/L16;rate=24000"}\n\n';
  const SSE_DONE_FRAME = `event: done\ndata: ${JSON.stringify({ creditsRemaining: 974, creditsUsed: 26, url: R2_AUDIO_URL })}\n\n`;
  const SSE_ERROR_FRAME =
    'event: error\ndata: {"error":"Voice generation blocked"}\n\n';

  const LONG_TEXT = 'a'.repeat(301);
  const SHORT_TEXT = 'a'.repeat(10);

  function setupAudioContextMock() {
    const mockStart = vi.fn();
    const mockConnect = vi.fn();
    const mockCreateBufferSource = vi.fn(() => ({
      buffer: null as unknown,
      connect: mockConnect,
      start: mockStart,
    }));
    const mockCopyToChannel = vi.fn();
    const mockCreateBuffer = vi.fn().mockReturnValue({
      copyToChannel: mockCopyToChannel,
      duration: 0.1,
    });
    const mockClose = vi.fn();

    const MockAudioContext = vi.fn().mockImplementation(function (this: any) {
      this.currentTime = 0;
      this.destination = {};
      this.createBuffer = mockCreateBuffer;
      this.createBufferSource = mockCreateBufferSource;
      this.close = mockClose;
    });

    vi.stubGlobal('AudioContext', MockAudioContext);

    return {
      MockAudioContext,
      mockClose,
      mockCreateBuffer,
      mockCreateBufferSource,
      mockStart,
    };
  }

  // HOTFIX: streaming is disabled (GEMINI_STREAMING_ENABLED === false), so the
  // client no longer requests the SSE path. Re-enable with the flag.
  it.skip('sends stream: true when Gemini voice and text exceeds threshold', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeSseStreamResponse([SSE_DONE_FRAME]));
    vi.stubGlobal('fetch', fetchMock);
    setupAudioContextMock();

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro31', name: 'kore' }),
    });

    const textarea = await screen.findByPlaceholderText(
      baseDict.textAreaPlaceholder,
    );
    fireEvent.change(textarea, { target: { value: LONG_TEXT } });

    await waitFor(() =>
      expect(screen.getByTestId('generate-button')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.voiceId).toBe('voice-id');
  });

  it('omits stream for Gemini voice when text is at or below threshold', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: R2_AUDIO_URL }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro31', name: 'kore' }),
    });

    const textarea = await screen.findByPlaceholderText(
      baseDict.textAreaPlaceholder,
    );
    fireEvent.change(textarea, { target: { value: SHORT_TEXT } });

    await waitFor(() =>
      expect(screen.getByTestId('generate-button')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBeUndefined();
  });

  it('omits stream for gpro (Gemini 2.5) voice even above threshold', async () => {
    // Only gpro31 (Gemini 3.1) streams progressively; gpro returns the whole
    // clip at once, so it must stay on the JSON path regardless of length.
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: R2_AUDIO_URL }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro', name: 'kore' }),
    });

    const textarea = await screen.findByPlaceholderText(
      baseDict.textAreaPlaceholder,
    );
    fireEvent.change(textarea, { target: { value: LONG_TEXT } });

    await waitFor(() =>
      expect(screen.getByTestId('generate-button')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBeUndefined();
  });

  it('omits stream for Grok voice regardless of text length', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: R2_AUDIO_URL }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
    });

    const textarea = screen.getByRole('textbox', {
      name: baseDict.textAreaPlaceholder,
    });
    fireEvent.change(textarea, { target: { value: LONG_TEXT } });

    await waitFor(() =>
      expect(screen.getByTestId('generate-button')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBeUndefined();
  });

  // HOTFIX: streaming disabled — see GEMINI_STREAMING_ENABLED.
  it.skip('schedules audio chunks via Web Audio and shows the streaming player', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeSseStreamResponse([SSE_AUDIO_FRAME, SSE_DONE_FRAME]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { MockAudioContext, mockCreateBuffer, mockCreateBufferSource } =
      setupAudioContextMock();

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro31', name: 'kore' }),
    });

    const textarea = await screen.findByPlaceholderText(
      baseDict.textAreaPlaceholder,
    );
    fireEvent.change(textarea, { target: { value: LONG_TEXT } });

    await waitFor(() =>
      expect(screen.getByTestId('generate-button')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('generate-button'));

    await waitFor(
      () => expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success),
      { timeout: 3000 },
    );

    // The streamed PCM chunk is decoded + scheduled through the Web Audio engine.
    expect(MockAudioContext).toHaveBeenCalledOnce();
    expect(mockCreateBuffer).toHaveBeenCalledOnce();
    expect(mockCreateBufferSource).toHaveBeenCalledOnce();

    // The single streaming player (waveform + play/pause) is shown — not the
    // standard file player. After the `done` event the full clip exists, so it
    // hands off to the seekable `file` phase immediately.
    await waitFor(() => {
      const player = screen.getByTestId('streaming-waveform-player');
      expect(player).toHaveAttribute('data-phase', 'file');
    });
    expect(screen.queryByTestId('audio-player')).not.toBeInTheDocument();
  });

  // HOTFIX: streaming disabled — see GEMINI_STREAMING_ENABLED.
  it.skip('shows error toast on SSE error event', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeSseStreamResponse([SSE_AUDIO_FRAME, SSE_ERROR_FRAME]),
      );
    vi.stubGlobal('fetch', fetchMock);
    setupAudioContextMock();

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro31', name: 'kore' }),
    });

    const textarea = await screen.findByPlaceholderText(
      baseDict.textAreaPlaceholder,
    );
    fireEvent.change(textarea, { target: { value: LONG_TEXT } });

    await waitFor(() =>
      expect(screen.getByTestId('generate-button')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('generate-button'));

    await waitFor(() =>
      expect(mockToastFn.error).toHaveBeenCalledWith(
        'Voice generation blocked (500)',
      ),
    );
  });
});
