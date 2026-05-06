// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('@ai-sdk/react', () => ({
  useCompletion: () => ({
    complete: vi.fn(),
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
    dict,
    onChange,
    placeholder,
    selectedGrokLanguage,
    setSelectedGrokLanguage,
    value,
  }: {
    dict: typeof baseDict.grok;
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
      return isPaidUser ? 2000 : 1000;
    }

    if (model === 'xai') {
      return isPaidUser ? 2000 : 1000;
    }

    return isPaidUser ? 1000 : 500;
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
  generating: 'Generating',
  cancel: 'Cancel',
  playAudio: 'Play audio',
  resetPlayer: 'Reset player',
  downloadAudio: 'Download audio',
  notEnoughCredits: 'Not enough credits',
  success: 'Success',
  error: 'Something went wrong',
  errorEstimating: 'Failed to estimate credits',
  dailyLimitError: 'Daily limit reached (__COUNT__)',
  split: {
    segmentCannotBeEmpty: 'Segment cannot be empty',
    segmentFailed: 'Segment __INDEX__ failed',
    segmentRetryFailed: 'Retry failed for segment __INDEX__',
    segmentGenerated: 'Segment __INDEX__ generated',
    splitToggleLabel: 'Split long text',
    downloadAllFailed: 'Failed to download all segments',
    segmentPreviews: 'Segment previews',
    downloadAll: 'Download all',
    joiningWav: 'Joining WAV',
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

  return render(<AudioGenerator {...defaultProps} {...overrides} />);
}

describe('AudioGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastFn.mockClear();
    mockToastFn.success.mockClear();
    mockToastFn.error.mockClear();
    mockToastFn.loading.mockClear();
    mockToastFn.dismiss.mockClear();
  });

  it('shows the Grok language selector with Automatic first and English second', async () => {
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

  it('shows Grok TTS editor for Grok voices', async () => {
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
});
