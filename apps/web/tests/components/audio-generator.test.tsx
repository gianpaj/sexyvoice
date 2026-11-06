// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
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
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';

const ORPHEUS_MODEL =
  'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f';

const invalidateQueries = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

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

const mockComplete = vi.hoisted(() => vi.fn());

vi.mock('@ai-sdk/react', () => ({
  useCompletion: () => ({
    complete: mockComplete,
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

vi.mock('@/lib/download', () => ({
  downloadUrl: vi.fn(),
}));

vi.mock('@/lib/react-textarea-autosize', () => ({
  resizeTextarea: vi.fn(),
}));

const errorCodesDict = {
  PROVIDER_UNAVAILABLE:
    '{provider} no está disponible temporalmente. Inténtalo de nuevo.',
} as const;

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
    <NextIntlClientProvider
      locale="es"
      messages={{ errorCodes: errorCodesDict, generate: baseDict }}
    >
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
    mockComplete.mockReset();
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

  it.each([
    { action: 'edit', currentText: 'New text' },
    { action: 'clear', currentText: '' },
    { action: 'edit back', currentText: 'Hello' },
  ])(
    'discards a pending improvement after $action',
    async ({ currentText }) => {
      const user = userEvent.setup();
      const enhancement = Promise.withResolvers<string>();
      mockComplete.mockReturnValueOnce(enhancement.promise);
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({ url: 'https://example.com/audio.mp3' }),
        ok: true,
      });
      vi.stubGlobal('fetch', fetchMock);
      renderAudioGenerator();
      const textarea = await screen.findByTestId('generate-textarea');
      fireEvent.change(textarea, { target: { value: 'Hello' } });
      await user.click(screen.getByTitle(baseDict.enhanceTextTitle));
      await waitFor(() => expect(mockComplete).toHaveBeenCalledOnce());

      fireEvent.change(textarea, { target: { value: 'New text' } });
      fireEvent.change(textarea, { target: { value: currentText } });
      await act(async () => enhancement.resolve('Hello [happy]'));
      expect(textarea).toHaveValue(currentText);
      expect(mockToastFn).not.toHaveBeenCalled();

      if (!currentText) {
        fireEvent.change(textarea, { target: { value: 'After clearing' } });
      }
      await user.click(screen.getByTestId('generate-button'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(getFetchRequestBody(fetchMock, 0)).toMatchObject({
        text: currentText || 'After clearing',
        textImproved: false,
      });
    },
  );

  it.each(['edit', 'replace', 'undo', 'clear', 'failed', 'repeat undo'])(
    'tracks text improvement after %s',
    async (action) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({ url: 'https://example.com/audio.mp3' }),
        ok: true,
      });
      vi.stubGlobal('fetch', fetchMock);
      mockComplete.mockResolvedValue(
        action === 'failed' ? undefined : 'Hello [happy]',
      );
      renderAudioGenerator();
      const textarea = await screen.findByTestId('generate-textarea');
      fireEvent.change(textarea, { target: { value: 'Hello' } });
      await user.click(screen.getByTestId('generate-button'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(getFetchRequestBody(fetchMock, 0).textImproved).toBe(false);

      await user.click(screen.getByTitle(baseDict.enhanceTextTitle));
      await waitFor(() => expect(mockComplete).toHaveBeenCalledOnce());
      if (action !== 'failed') {
        await waitFor(() => expect(textarea).toHaveValue('Hello [happy]'));
      }
      if (action === 'edit') {
        fireEvent.change(textarea, {
          target: { value: 'Hello [happy] again' },
        });
      } else if (action === 'replace') {
        fireEvent.change(textarea, {
          target: { value: 'Completely unrelated replacement text' },
        });
      } else if (action === 'undo') {
        act(() => mockToastFn.mock.calls.at(-1)?.[1].action.onClick());
      } else if (action === 'clear') {
        fireEvent.change(textarea, { target: { value: '' } });
        fireEvent.change(textarea, { target: { value: 'New text' } });
      } else if (action === 'repeat undo') {
        fireEvent.change(textarea, {
          target: { value: 'Hello [happy] again' },
        });
        mockComplete.mockResolvedValueOnce('Hello [excited] again');
        await user.click(screen.getByTitle(baseDict.enhanceTextTitle));
        expect(mockComplete).toHaveBeenLastCalledWith(
          'Hello [happy] again',
          expect.anything(),
        );
        await waitFor(() =>
          expect(textarea).toHaveValue('Hello [excited] again'),
        );
        act(() => mockToastFn.mock.calls.at(-1)?.[1].action.onClick());
        expect(textarea).toHaveValue('Hello [happy] again');
      }

      await user.click(screen.getByTestId('generate-button'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      if (action === 'repeat undo') {
        expect(getFetchRequestBody(fetchMock, 1)).toMatchObject({
          text: 'Hello [happy] again',
          textImproved: true,
        });
      }
      expect(getFetchRequestBody(fetchMock, 1).textImproved).toBe(
        ['edit', 'replace', 'repeat undo'].includes(action),
      );
    },
  );

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

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['credits'] });
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
      textImproved: false,
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

  it('shows the AI enhance button for Gemini 3.8 voices', async () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        language: 'multiple',
        model: 'gpro38',
        name: 'kore',
      }),
    });

    // The prompt editor is loaded with next/dynamic.
    await screen.findByTestId('generate-textarea');
    expect(
      screen.getByTitle('Enhance text with AI emotion tags'),
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
      textImproved: false,
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
      selectedVoice: createVoice({ model: 'gpro38', name: 'achernar' }),
    });

    expect(
      screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      }),
    ).toBeDisabled();
    expect(
      screen.getByPlaceholderText(baseDict.textAreaPlaceholder),
    ).toHaveAttribute('maxlength', String(500 + CHARACTERS_LIMIT_GRACE));
  });

  it('clamps non-Grok text to the character limit plus grace', async () => {
    const user = userEvent.setup();
    const charactersLimit = 500;
    const maximumLength = charactersLimit + CHARACTERS_LIMIT_GRACE;

    renderAudioGenerator({
      isPaidUser: false,
      selectedVoice: createVoice({ model: 'gpro38', name: 'achernar' }),
    });

    const input = screen.getByPlaceholderText(baseDict.textAreaPlaceholder);
    await user.type(input, 'A'.repeat(maximumLength + 10));

    expect(input).toHaveValue('A'.repeat(maximumLength));
    expect(screen.getByTestId('generate-character-count')).toHaveTextContent(
      `${maximumLength} / ${charactersLimit}`,
    );
    expect(screen.getByTestId('generate-character-count')).toHaveClass(
      'text-red-500',
    );
  });

  it('removes the paid non-Grok character limit when split audios is enabled', async () => {
    const user = userEvent.setup();

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro38', name: 'achernar' }),
    });

    const input = screen.getByPlaceholderText(baseDict.textAreaPlaceholder);
    expect(input).toHaveAttribute(
      'maxlength',
      String(1000 + CHARACTERS_LIMIT_GRACE),
    );

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

  it.each([false, true])(
    'generates each Replicate split segment separately with first segment cached=%s',
    async (cached) => {
      const user = userEvent.setup();
      const firstSegment = `${'A'.repeat(300)}.`;
      const secondSegment = `${'B'.repeat(300)}.`;
      const longText = `${firstSegment} ${secondSegment}`;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({
            cached,
            url: 'https://example.com/segment-1.mp3',
          }),
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
        expect(invalidateQueries).toHaveBeenCalledTimes(cached ? 1 : 2);
      });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        split: true,
        styleVariant: '',
        text: firstSegment,
        textImproved: false,
        voiceId: 'voice-id',
      });
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        split: true,
        styleVariant: '',
        text: secondSegment,
        textImproved: false,
        voiceId: 'voice-id',
      });
      expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
      // Multiple segments show the progress modal, reaching completion on the
      // final segment.
      expect(mockToastFn.loading).toHaveBeenCalled();
      expect(mockToastFn.dismiss).toHaveBeenCalled();
    },
  );

  it('blocks split generation when the text creates more than 20 segments', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const tooManySegmentsText = Array.from(
      { length: 21 },
      (_, index) => `${String.fromCharCode(65 + index).repeat(300)}.`,
    ).join(' ');

    renderAudioGenerator({
      selectedVoice: createVoice({ model: 'gpro38', name: 'achernar' }),
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
        model: 'gpro38',
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
      expect(invalidateQueries).toHaveBeenCalledTimes(2);
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      split: true,
      styleVariant: 'Read this in a dramatic whisper',
      text: firstSegment,
      textImproved: false,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      split: true,
      styleVariant: 'Read this in a dramatic whisper',
      text: secondSegment,
      textImproved: false,
      voiceId: 'voice-id',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
  });

  it.each([
    { model: 'gpro38', name: 'achernar', provider: 'Gemini' },
    { model: 'xai', name: 'eve', provider: 'Grok' },
    {
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      name: 'tara',
      provider: 'Replicate',
    },
  ])(
    'localizes $provider JSON provider failures',
    async ({ model, name, provider }) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({
          details: { provider },
          error: `${provider} is temporarily unavailable. Please retry.`,
          errorCode: 'PROVIDER_UNAVAILABLE',
        }),
        ok: false,
        status: 503,
      });
      vi.stubGlobal('fetch', fetchMock);

      renderAudioGenerator({
        selectedVoice: createVoice({ model, name }),
      });

      const input =
        model === 'xai'
          ? screen.getByRole('textbox', {
              name: baseDict.textAreaPlaceholder,
            })
          : await screen.findByPlaceholderText(baseDict.textAreaPlaceholder);
      await user.type(input, 'Hello world');
      await user.click(screen.getByTestId('generate-button'));

      await waitFor(() => {
        expect(mockToastFn.error).toHaveBeenCalledWith(
          `${provider} no está disponible temporalmente. Inténtalo de nuevo. (503)`,
        );
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
        queryKey: ['credits'],
      });
    },
  );

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
      selectedVoice: createVoice({ model: 'gpro38', name: 'achernar' }),
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
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['credits'] });
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
      .mockImplementationOnce(
        (_url: string, { signal }: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedStyle: 'calm',
      selectedVoice: createVoice({ model: 'gpro38', name: 'achernar' }),
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
    await user.click(screen.getByRole('button', { name: baseDict.cancel }));
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: baseDict.split.retry }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getAllByText(baseDict.split.statusPending).length).toBe(2);
    expect(mockToastFn.error).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: ['credits'],
    });
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
      selectedVoice: createVoice({ model: 'gpro38', name: 'achernar' }),
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
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      split: true,
      styleVariant: 'dramatic',
      text: secondSegment,
      textImproved: false,
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
      selectedVoice: createVoice({ model: 'gpro38', name: 'achernar' }),
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
    const selectedVoice = createVoice({ model: 'gpro38', name: 'achernar' });
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
      textImproved: false,
      voiceId: 'voice-id',
    });
    expect(getFetchRequestBody(fetchMock, 3)).toEqual({
      split: true,
      styleVariant: 'calm',
      text: secondSegment,
      textImproved: false,
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
      expect(invalidateQueries).toHaveBeenCalledTimes(2);
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      language: 'en',
      split: true,
      styleVariant: '',
      text: firstSegment,
      textImproved: false,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      language: 'en',
      split: true,
      styleVariant: '',
      text: secondSegment,
      textImproved: false,
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
      textImproved: false,
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
      textImproved: false,
      voiceId: 'voice-id',
    });
    expect(getFetchRequestBody(fetchMock, 3)).toEqual({
      language: 'ar-EG',
      split: true,
      styleVariant: '',
      text: secondSegment,
      textImproved: false,
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
      textImproved: false,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      language: 'auto',
      split: true,
      styleVariant: '',
      text: wrappedSegment,
      textImproved: false,
      voiceId: 'voice-id',
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      language: 'auto',
      split: true,
      styleVariant: '',
      text: lastSegment,
      textImproved: false,
      voiceId: 'voice-id',
    });
    expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
  });

  const R2_AUDIO_URL = 'https://files.sexyvoice.ai/audio.wav';
  const LONG_TEXT = 'a'.repeat(301);

  describe('Credit refresh', () => {
    it.each([
      { cached: true, refreshCount: 0 },
      { cached: false, refreshCount: 1 },
      { cached: undefined, refreshCount: 1 },
    ])(
      'refreshes $refreshCount times when cached=$cached',
      async ({ cached, refreshCount }) => {
        const user = userEvent.setup();
        const payload = {
          cached,
          creditsUsed: 0,
          url: R2_AUDIO_URL,
        };
        const fetchMock = vi
          .fn()
          .mockResolvedValue({ ok: true, json: async () => payload });
        vi.stubGlobal('fetch', fetchMock);
        renderAudioGenerator({
          selectedVoice: createVoice({ model: 'gpro38', name: 'kore' }),
        });
        fireEvent.change(
          await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
          { target: { value: LONG_TEXT } },
        );
        await user.click(screen.getByTestId('generate-button'));

        await waitFor(() => {
          expect(mockToastFn.success).toHaveBeenCalledWith(baseDict.success);
        });
        expect(getFetchRequestBody(fetchMock, 0).stream).toBe(undefined);
        expect(invalidateQueries).toHaveBeenCalledTimes(refreshCount);
        expect(screen.getByTestId('audio-player')).toHaveAttribute(
          'data-url',
          R2_AUDIO_URL,
        );
      },
    );
  });

  it.each(['fetch', 'JSON body'])(
    'does not refresh credits when cancelled during %s',
    async (stage) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn(async (_url: string, { signal }: RequestInit) => {
        const pending = new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
        return stage === 'fetch' ? pending : { json: () => pending, ok: true };
      });
      vi.stubGlobal('fetch', fetchMock);

      renderAudioGenerator({
        selectedVoice: createVoice({ model: 'gpro38', name: 'kore' }),
      });
      fireEvent.change(
        await screen.findByPlaceholderText(baseDict.textAreaPlaceholder),
        { target: { value: LONG_TEXT } },
      );
      await user.click(screen.getByTestId('generate-button'));

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(getFetchRequestBody(fetchMock, 0).stream).toBe(undefined);
      expect(invalidateQueries).not.toHaveBeenCalled();

      await act(async () => {
        await user.click(screen.getByRole('button', { name: baseDict.cancel }));
      });

      expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
      expect(screen.getByTestId('generate-button')).toBeEnabled();
      expect(invalidateQueries).not.toHaveBeenCalled();
      expect(mockToastFn.error).not.toHaveBeenCalled();
      expect(mockToastFn.success).not.toHaveBeenCalled();
    },
  );

  describe('Keyboard shortcut', () => {
    it('generates with Cmd/Ctrl+Enter only when Generate is enabled', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({ url: 'https://example.com/audio.wav' }),
        ok: true,
      });
      vi.stubGlobal('fetch', fetchMock);
      renderAudioGenerator({
        isPaidUser: false,
        selectedVoice: createVoice({ model: 'gpro38', name: 'kore' }),
      });
      const input = await screen.findByTestId('generate-textarea');

      await user.keyboard('{Control>}{Enter}{/Control}');
      fireEvent.change(input, { target: { value: 'a'.repeat(501) } });
      await user.keyboard('{Meta>}{Enter}{/Meta}');
      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: 'Hello' } });
      await user.keyboard('{Meta>}{Enter}{/Meta}');
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(getFetchRequestBody(fetchMock, 0)).toMatchObject({
        text: 'Hello',
      });
    });

    it('ignores Cmd/Ctrl+Enter without credits or while generating', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn(() => new Promise(() => undefined));
      vi.stubGlobal('fetch', fetchMock);
      const view = renderAudioGenerator({
        hasEnoughCredits: false,
        selectedVoice: createVoice({ model: 'gpro38', name: 'kore' }),
      });
      fireEvent.change(await screen.findByTestId('generate-textarea'), {
        target: { value: 'Hello' },
      });
      await user.keyboard('{Control>}{Enter}{/Control}');
      expect(fetchMock).not.toHaveBeenCalled();

      view.rerender(
        <NextIntlClientProvider
          locale="es"
          messages={{ errorCodes: errorCodesDict, generate: baseDict }}
        >
          <AudioGenerator
            hasEnoughCredits
            isPaidUser
            selectedVoice={createVoice({ model: 'gpro38', name: 'kore' })}
          />
        </NextIntlClientProvider>,
      );
      await user.keyboard('{Control>}{Enter}{/Control}');
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      await user.keyboard('{Control>}{Enter}{/Control}');
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });

  describe('Text limits', () => {
    it.each([
      { isPaidUser: false, limit: 500, model: 'gpro38' },
      { isPaidUser: true, limit: 1000, model: 'gpro38' },
      { isPaidUser: false, limit: 500, model: ORPHEUS_MODEL },
      { isPaidUser: true, limit: 500, model: ORPHEUS_MODEL },
    ])(
      'counts $model text against $limit characters when paid=$isPaidUser',
      async ({ isPaidUser, limit, model }) => {
        renderAudioGenerator({
          isPaidUser,
          selectedVoice: createVoice({ model, name: 'kore' }),
        });
        const input = await screen.findByTestId('generate-textarea');

        expect(
          screen.getByTestId('generate-character-count'),
        ).toHaveTextContent(`0 / ${limit}`);
        expect(input).toHaveAttribute(
          'maxlength',
          String(limit + CHARACTERS_LIMIT_GRACE),
        );
      },
    );

    it.each([
      { isPaidUser: false, limit: 500 },
      { isPaidUser: true, limit: 1000 },
    ])(
      'limits Grok text to $limit characters when paid=$isPaidUser',
      ({ isPaidUser, limit }) => {
        renderAudioGenerator({
          isPaidUser,
          selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
        });

        expect(
          screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
        ).toHaveAttribute('maxlength', String(limit));
      },
    );

    it('blocks generation and estimates while the style is over its limit', async () => {
      renderAudioGenerator({
        isPaidUser: false,
        selectedStyle: 's'.repeat(1001),
        selectedVoice: createVoice({ model: 'gpro38', name: 'kore' }),
      });
      fireEvent.change(await screen.findByTestId('generate-textarea'), {
        target: { value: 'Hello' },
      });

      expect(screen.getByTestId('generate-button')).toBeDisabled();
      expect(
        screen.getByRole('button', { name: baseDict.estimateCreditsButton }),
      ).toBeDisabled();
    });
  });

  describe('Advanced settings', () => {
    const settings = { seed: 42, speed: 1.2, temperature: 0.8 };

    it.each([
      {
        expected: { seed: 42, styleVariant: 'calm', temperature: 0.8 },
        model: 'gpro38',
      },
      {
        expected: { language: 'auto', speed: 1.2, styleVariant: '' },
        model: 'xai',
      },
      { expected: { styleVariant: '' }, model: ORPHEUS_MODEL },
    ])(
      'sends only the settings a $model voice honours',
      async ({ expected, model }) => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockResolvedValue({
          json: async () => ({ url: 'https://example.com/audio.wav' }),
          ok: true,
        });
        vi.stubGlobal('fetch', fetchMock);
        renderAudioGenerator({
          selectedStyle: 'calm',
          selectedVoice: createVoice({ model, name: 'kore' }),
          settings,
        });

        const input =
          model === 'xai'
            ? screen.getByRole('textbox', {
                name: baseDict.textAreaPlaceholder,
              })
            : await screen.findByTestId('generate-textarea');
        fireEvent.change(input, { target: { value: 'Hello' } });
        await user.click(screen.getByTestId('generate-button'));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        expect(getFetchRequestBody(fetchMock, 0)).toEqual({
          split: false,
          text: 'Hello',
          textImproved: false,
          voiceId: 'voice-id',
          ...expected,
        });
      },
    );

    it.each([
      { model: 'gpro38', usesSeed: true },
      { model: 'xai', usesSeed: false },
      { model: ORPHEUS_MODEL, usesSeed: false },
    ])(
      'retries a failed $model segment with a fresh seed when the model uses seeds',
      async ({ model, usesSeed }) => {
        const user = userEvent.setup();
        const firstSegment = `${'A'.repeat(300)}.`;
        const secondSegment = `${'B'.repeat(300)}.`;
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce({
            json: async () => ({ error: 'Server error' }),
            ok: false,
            status: 500,
          })
          .mockResolvedValue({
            json: async () => ({ url: 'https://example.com/retry.wav' }),
            ok: true,
          });
        vi.stubGlobal('fetch', fetchMock);
        renderAudioGenerator({
          selectedVoice: createVoice({ model, name: 'kore' }),
          settings: { seed: 42, speed: null, temperature: null },
        });

        const input =
          model === 'xai'
            ? screen.getByRole('textbox', {
                name: baseDict.textAreaPlaceholder,
              })
            : await screen.findByTestId('generate-textarea');
        fireEvent.change(input, {
          target: { value: `${firstSegment} ${secondSegment}` },
        });
        await user.click(
          screen.getByRole('checkbox', {
            name: baseDict.split.splitToggleLabel,
          }),
        );
        await waitFor(() => {
          expect(
            screen.getByText(baseDict.split.segmentPreviews),
          ).toBeVisible();
        });
        await user.click(screen.getByTestId('generate-button'));
        await user.click(
          await screen.findByRole('button', { name: baseDict.split.retry }),
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const retrySeed = getFetchRequestBody(fetchMock, 1).seed;
        expect(getFetchRequestBody(fetchMock, 1).text).toBe(firstSegment);
        if (!usesSeed) {
          expect(getFetchRequestBody(fetchMock, 0).seed).toBeUndefined();
          expect(retrySeed).toBeUndefined();
          return;
        }
        expect(getFetchRequestBody(fetchMock, 0).seed).toBe(42);
        expect(Number.isInteger(retrySeed)).toBe(true);
        expect(retrySeed).toBeGreaterThanOrEqual(1_000_000);
        expect(retrySeed).toBeLessThan(10_000_000);
      },
    );
  });

  describe('Estimate errors', () => {
    it.each([
      {
        body: { error: 'Text exceeds the maximum length of 500 characters' },
        message: 'Text exceeds the maximum length of 500 characters (400)',
        status: 400,
      },
      { body: {}, message: `${baseDict.errorEstimating} (500)`, status: 500 },
    ])(
      'shows "$message" when the estimate answers $status',
      async ({ body, message, status }) => {
        const user = userEvent.setup();
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue({
            json: async () => body,
            ok: false,
            status,
          }),
        );
        renderAudioGenerator({
          selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
        });
        fireEvent.change(
          screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
          { target: { value: 'Hello' } },
        );

        await user.click(
          screen.getByRole('button', { name: baseDict.estimateCreditsButton }),
        );

        await waitFor(() =>
          expect(mockToastFn.error).toHaveBeenCalledWith(message),
        );
      },
    );

    it('shows the estimate error when the request fails', async () => {
      const user = userEvent.setup();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
      renderAudioGenerator({
        selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
      });
      fireEvent.change(
        screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
        { target: { value: 'Hello' } },
      );

      await user.click(
        screen.getByRole('button', { name: baseDict.estimateCreditsButton }),
      );

      await waitFor(() =>
        expect(mockToastFn.error).toHaveBeenCalledWith(
          baseDict.errorEstimating,
        ),
      );
    });

    it('sums the segment estimates in split mode', async () => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({ estimatedCredits: 300 }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: async () => ({ estimatedCredits: 400 }),
          ok: true,
        });
      vi.stubGlobal('fetch', fetchMock);
      renderAudioGenerator({
        selectedVoice: createVoice({ model: 'xai', name: 'eve' }),
      });
      fireEvent.change(
        screen.getByRole('textbox', { name: baseDict.textAreaPlaceholder }),
        { target: { value: `${'A'.repeat(300)}. ${'B'.repeat(300)}.` } },
      );
      await user.click(
        screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
      );
      await waitFor(() => {
        expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
      });

      await user.click(
        screen.getByRole('button', { name: baseDict.estimateCreditsButton }),
      );

      expect(await screen.findByText('~700')).toBeInTheDocument();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        '/api/estimate-credits',
        '/api/estimate-credits',
      ]);
      expect(getFetchRequestBody(fetchMock, 0)).toEqual({
        styleVariant: '',
        text: `${'A'.repeat(300)}.`,
        voiceId: 'voice-id',
      });
    });
  });

  describe('Split sessions', () => {
    const firstSegment = `${'A'.repeat(300)}.`;
    const secondSegment = `${'B'.repeat(300)}.`;

    async function generateTwoSegments(
      props: Partial<React.ComponentProps<typeof AudioGenerator>>,
    ) {
      const user = userEvent.setup();
      const fetchMock = vi.fn(async () => ({
        json: async () => ({
          url: `https://example.com/segment-${fetchMock.mock.calls.length}.wav`,
        }),
        ok: true,
      }));
      vi.stubGlobal('fetch', fetchMock);
      const view = renderAudioGenerator({ selectedStyle: 'calm', ...props });
      fireEvent.change(await screen.findByTestId('generate-textarea'), {
        target: { value: `${firstSegment} ${secondSegment}` },
      });
      await user.click(
        screen.getByRole('checkbox', { name: baseDict.split.splitToggleLabel }),
      );
      await waitFor(() => {
        expect(screen.getByText(baseDict.split.segmentPreviews)).toBeVisible();
      });
      await user.click(screen.getByTestId('generate-button'));
      await waitFor(() => {
        expect(
          screen.getAllByText(baseDict.split.statusGenerated),
        ).toHaveLength(2);
      });
      return { fetchMock, user, view };
    }

    function rerenderGenerator(
      view: ReturnType<typeof render>,
      props: Partial<React.ComponentProps<typeof AudioGenerator>>,
    ) {
      view.rerender(
        <NextIntlClientProvider
          locale="es"
          messages={{ errorCodes: errorCodesDict, generate: baseDict }}
        >
          <AudioGenerator
            hasEnoughCredits
            isPaidUser
            selectedStyle="calm"
            {...props}
          />
        </NextIntlClientProvider>,
      );
    }

    it('starts over when the voice changes', async () => {
      const { view } = await generateTwoSegments({
        selectedVoice: createVoice({ model: 'gpro38', name: 'kore' }),
      });

      rerenderGenerator(view, {
        selectedVoice: createVoice({
          id: 'voice-zephyr',
          model: 'gpro38',
          name: 'zephyr',
        }),
      });

      await waitFor(() => {
        expect(screen.getAllByText(baseDict.split.statusPending)).toHaveLength(
          2,
        );
      });
    });

    it('keeps generated segments after an advanced setting changes', async () => {
      const selectedVoice = createVoice({ model: 'gpro38', name: 'kore' });
      const { view } = await generateTwoSegments({ selectedVoice });

      rerenderGenerator(view, {
        selectedVoice,
        settings: { seed: 7, speed: null, temperature: null },
      });

      await act(async () => undefined);
      expect(screen.getAllByText(baseDict.split.statusGenerated)).toHaveLength(
        2,
      );
    });

    it('restores generated segments when split mode is toggled back on', async () => {
      const { user } = await generateTwoSegments({
        selectedVoice: createVoice({ model: 'gpro38', name: 'kore' }),
      });
      const toggle = screen.getByRole('checkbox', {
        name: baseDict.split.splitToggleLabel,
      });

      await user.click(toggle);
      expect(
        screen.queryByText(baseDict.split.segmentPreviews),
      ).not.toBeInTheDocument();
      await user.click(toggle);

      await waitFor(() => {
        expect(
          screen.getAllByText(baseDict.split.statusGenerated),
        ).toHaveLength(2);
      });
    });

    it('downloads all generated Gemini segments as one wav', async () => {
      const { fetchMock, user } = await generateTwoSegments({
        selectedVoice: createVoice({ model: 'gpro38', name: 'kore' }),
      });
      fetchMock.mockResolvedValue({
        blob: async () => new Blob(['segment'], { type: 'audio/wav' }),
        ok: true,
      } as never);
      stubAudioMetadata(2);
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: vi.fn(() => 'blob:joined-audio'),
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: vi.fn(),
      });
      const downloads: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        function (this: HTMLAnchorElement) {
          downloads.push(this.download);
        },
      );

      await user.click(
        screen.getByRole('button', { name: baseDict.split.downloadAll }),
      );

      await waitFor(() => expect(downloads).toEqual(['generated-audio.wav']));
      expect(mockJoinSegments).toHaveBeenCalledWith(
        [
          { endSec: 2, file: expect.any(File), startSec: 0 },
          { endSec: 2, file: expect.any(File), startSec: 0 },
        ],
        'wav',
      );
    });
  });
});
