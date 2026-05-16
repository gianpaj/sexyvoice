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
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
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

vi.mock('@/app/[lang]/(dashboard)/dashboard/clone/audio-provider', () => ({
  useAudio: () => ({
    reset: vi.fn(),
  }),
}));

vi.mock('@/components/services/toast', () => ({
  toast: mockToastFn,
}));

vi.mock('@/components/audio-player-with-context', () => ({
  AudioPlayerWithContext: () => null,
}));

vi.mock('@/components/grok-tts-editor', () => ({
  GrokTTSEditor: ({
    charactersLimit,
    dict,
    enforceCharactersLimit = true,
    onChange,
    placeholder,
    selectedGrokLanguage,
    setSelectedGrokLanguage,
    value,
  }: {
    charactersLimit: number;
    dict: typeof baseDict.grok;
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
          {dict.languageLabel}
        </label>
        <select
          id="grok-language"
          onChange={(event) =>
            setSelectedGrokLanguage(event.currentTarget.value)
          }
          value={selectedGrokLanguage}
        >
          <option value="auto">{dict.langAutomatic}</option>
          <option value="en">{dict.langEnglish}</option>
          <option value="ar-EG">{dict.langArabicEgypt}</option>
          <option value="ar-SA">{dict.langArabicSaudiArabia}</option>
        </select>
      </div>
      <textarea
        aria-label={placeholder}
        maxLength={enforceCharactersLimit ? charactersLimit : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
      <button type="button">{dict.inlineEffectPlaceholder}</button>
    </>
  ),
}));

vi.mock('@/lib/ai', () => ({
  getCharactersLimit: vi.fn((model?: string, isPaidUser?: boolean) => {
    if (model === 'gpro') {
      return isPaidUser ? 1000 : 500;
    }

    if (model === 'xai') {
      return isPaidUser ? 1000 : 500;
    }

    return 500;
  }),
}));

vi.mock('@/lib/download', () => ({
  downloadUrl: vi.fn(),
}));

vi.mock('@/lib/react-textarea-autosize', () => ({
  resizeTextarea: vi.fn(),
}));

const baseDict = {
  title: 'Generate audio',
  textAreaPlaceholder: 'Enter text',
  estimateCreditsButton: 'Estimate credits',
  languageLabel: 'Language',
  languageSelectPlaceholder: 'Select a language',
  langAutomatic: 'Automatic',
  ctaButton: 'Generate',
  ctaButtonPlural: 'Generate audios',
  generating: 'Generating',
  cancel: 'Cancel',
  playAudio: 'Play audio',
  resetPlayer: 'Reset player',
  downloadAudio: 'Download audio',
  enhanceTextTitle: 'Enhance text with AI emotion tags',
  notEnoughCredits: 'Not enough credits',
  fullscreenTitle: 'Fullscreen',
  paidCharacterLimitTooltip: 'Paid users enjoy 2× character limit',
  success: 'Success',
  upgradeCharacterLimitTooltip: 'Upgrade to a paid plan for 2× character limit',
  error: 'Something went wrong',
  errorEstimating: 'Failed to estimate credits',
  dailyLimitError: 'Daily limit reached (__COUNT__)',
  split: {
    segmentCannotBeEmpty: 'Segment cannot be empty',
    segmentFailed: 'Segment __INDEX__ failed',
    segmentRetryFailed: 'Retry failed for segment __INDEX__',
    segmentGenerated: 'Segment __INDEX__ generated',
    splitToggleLabel: 'Split long text',
    splitToggleDisabled: 'Split text audios is available for paid users.',
    tooManySegments:
      'Split text can have at most __COUNT__ segments. Shorten the text or combine segments before generating.',
    downloadAllFailed: 'Failed to download all segments',
    segmentPreviews: 'Segment previews',
    downloadAll: 'Download all',
    joiningWav: 'Joining audio',
    preparingJoiner: 'Preparing joiner',
    segmentLabel: 'Segment __INDEX__',
    retry: 'Retry',
    statusGenerated: 'Generated',
    statusGenerating: 'Generating',
    statusFailed: 'Failed',
    statusPending: 'Pending',
    progressSegment: 'Segment __CURRENT__/__TOTAL__',
    progressTitle: 'Audio generation',
    progressTitleWithVoice: '__VOICE__ generation',
  },
  grok: {
    helperText: 'Use Grok tags to control delivery.',
    languageLabel: 'Language',
    languageSelectPlaceholder: 'Select a language',
    langAutomatic: 'Automatic',
    langEnglish: 'English',
    langArabicEgypt: 'Arabic (Egypt)',
    langArabicSaudiArabia: 'Arabic (Saudi Arabia)',
    langArabicUnitedArabEmirates: 'Arabic (United Arab Emirates)',
    langBengali: 'Bengali',
    langChinese: 'Chinese',
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
    langSpanishSpain: 'Spanish (Spain)',
    langSpanishMexico: 'Spanish (Mexico)',
    langTurkish: 'Turkish',
    langVietnamese: 'Vietnamese',
    inlineEffectPlaceholder: 'Insert tags',
    wrappingEffectPlaceholder: 'Wrap selected text',
    formatPlaceholder: 'Select format',
    effects: {
      pause: 'Pause',
      longPause: 'Long pause',
      humTune: 'Hum tune',
      laugh: 'Laugh',
      chuckle: 'Chuckle',
      giggle: 'Giggle',
      cry: 'Cry',
      tsk: 'Tsk',
      tongueClick: 'Tongue click',
      lipSmack: 'Lip smack',
      breath: 'Breath',
      inhale: 'Inhale',
      exhale: 'Exhale',
      sigh: 'Sigh',
    },
  },
} as const;

function createVoice(
  overrides: Partial<Tables<'voices'>> = {},
): Tables<'voices'> {
  return {
    id: 'voice-id',
    name: 'tara',
    language: 'en',
    model:
      'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
    description: null,
    type: null,
    sort_order: 0,
    feature: 'tts',
    sample_url: null,
    sample_prompt: null,
    user_id: null,
    created_at: null,
    ...overrides,
  } as Tables<'voices'>;
}

function renderAudioGenerator(
  overrides: Partial<React.ComponentProps<typeof AudioGenerator>> = {},
) {
  const defaultProps: React.ComponentProps<typeof AudioGenerator> = {
    dict: baseDict as unknown as typeof import('@/messages/en.json')['generate'],
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
        name: 'eve',
        model: 'xai',
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
      ok: true,
      json: async () => ({ url: 'https://example.com/audio.mp3' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({
        name: 'eve',
        model: 'xai',
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
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/generate-voice',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: 'مرحبا',
            voice: 'eve',
            styleVariant: '',
            language: 'ar-EG',
            split: false,
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  it('shows estimate credits UI for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        name: 'eve',
        model: 'xai',
      }),
    });

    expect(
      screen.getByRole('button', { name: baseDict.estimateCreditsButton }),
    ).toBeInTheDocument();
  });

  it('hides the AI enhance button for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        name: 'eve',
        model: 'xai',
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
        name: 'eve',
        model: 'xai',
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
        name: 'tara',
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      }),
    });

    expect(
      screen.queryByRole('button', { name: /insert tags/i }),
    ).not.toBeInTheDocument();
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
      ok: true,
      json: async () => ({ url: 'https://example.com/audio.mp3' }),
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
      text: shortText,
      voice: 'tara',
      split: false,
      styleVariant: '',
    });
  });

  it('disables split mode for free users', () => {
    renderAudioGenerator({
      isPaidUser: false,
      selectedVoice: createVoice({ name: 'achernar', model: 'gpro' }),
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
      selectedVoice: createVoice({ name: 'achernar', model: 'gpro' }),
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
        name: 'eve',
        model: 'xai',
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
        name: 'eve',
        model: 'xai',
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
        ok: true,
        json: async () => ({ url: 'https://example.com/segment-1.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com/segment-2.mp3' }),
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
      text: firstSegment,
      voice: 'tara',
      split: true,
      styleVariant: '',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      text: secondSegment,
      voice: 'tara',
      split: true,
      styleVariant: '',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
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
      selectedVoice: createVoice({ name: 'achernar', model: 'gpro' }),
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
        ok: true,
        json: async () => ({ url: 'https://example.com/gemini-1.wav' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com/gemini-2.wav' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'Read this in a dramatic whisper',
      selectedVoice: createVoice({
        name: 'achernar',
        model: 'gpro',
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
      text: firstSegment,
      voice: 'achernar',
      split: true,
      styleVariant: 'Read this in a dramatic whisper',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      text: secondSegment,
      voice: 'achernar',
      split: true,
      styleVariant: 'Read this in a dramatic whisper',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
  });

  it('generates Gemini split segments and stops on first failure', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'calm',
      selectedVoice: createVoice({ name: 'achernar', model: 'gpro' }),
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
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })
      .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'calm',
      selectedVoice: createVoice({ name: 'achernar', model: 'gpro' }),
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
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://example.com/gemini-1.wav' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://example.com/gemini-2.wav' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'dramatic',
      selectedVoice: createVoice({ name: 'achernar', model: 'gpro' }),
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
      text: secondSegment,
      voice: 'achernar',
      split: true,
      styleVariant: 'dramatic',
    });
  });

  it('regenerates cached Gemini split segments when the style changes', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const selectedVoice = createVoice({ name: 'achernar', model: 'gpro' });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        url: `https://example.com/gemini-${fetchMock.mock.calls.length}.wav`,
      }),
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
          dict={
            baseDict as unknown as typeof import('@/messages/en.json')['generate']
          }
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
      text: firstSegment,
      voice: 'achernar',
      split: true,
      styleVariant: 'calm',
    });
    expect(getFetchRequestBody(fetchMock, 3)).toEqual({
      text: secondSegment,
      voice: 'achernar',
      split: true,
      styleVariant: 'calm',
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
        ok: true,
        json: async () => ({ url: 'https://example.com/grok-fr-1.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com/grok-fr-2.mp3' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ name: 'eve', model: 'xai' }),
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
      text: firstSegment,
      voice: 'eve',
      styleVariant: '',
      split: true,
      language: 'en',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      text: secondSegment,
      voice: 'eve',
      styleVariant: '',
      split: true,
      language: 'en',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
  });

  it('generates Grok split segments and stops on first failure', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Rate limit exceeded' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ name: 'eve', model: 'xai' }),
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
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://example.com/grok-1.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://example.com/grok-2.mp3' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ name: 'eve', model: 'xai' }),
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
      text: secondSegment,
      voice: 'eve',
      styleVariant: '',
      split: true,
      language: 'auto',
    });
  });

  it('regenerates cached Grok split segments when the language changes', async () => {
    const user = userEvent.setup();
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;
    const longText = `${firstSegment} ${secondSegment}`;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        url: `https://example.com/grok-${fetchMock.mock.calls.length}.mp3`,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({ name: 'eve', model: 'xai' }),
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
      text: firstSegment,
      voice: 'eve',
      styleVariant: '',
      split: true,
      language: 'ar-EG',
    });
    expect(getFetchRequestBody(fetchMock, 3)).toEqual({
      text: secondSegment,
      voice: 'eve',
      styleVariant: '',
      split: true,
      language: 'ar-EG',
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
        ok: true,
        json: async () => ({ url: 'https://example.com/grok-1.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com/grok-2.mp3' }),
      })
      .mockResolvedValue({
        ok: true,
        blob: async () => grokAudioBlob,
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
        name: 'eve',
        model: 'xai',
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
        ok: true,
        json: async () => ({ url: 'https://example.com/grok-1.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com/grok-2.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://example.com/grok-3.mp3' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({
        name: 'eve',
        model: 'xai',
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
      text: firstSegment,
      voice: 'eve',
      styleVariant: '',
      split: true,
      language: 'auto',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      text: wrappedSegment,
      voice: 'eve',
      styleVariant: '',
      split: true,
      language: 'auto',
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      text: lastSegment,
      voice: 'eve',
      styleVariant: '',
      split: true,
      language: 'auto',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
  });
});
