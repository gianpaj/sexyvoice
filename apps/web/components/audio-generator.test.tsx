// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioGenerator } from '@/components/audio-generator';

const mockToastFn = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
);

vi.mock('@ai-sdk/react', () => ({
  useCompletion: () => ({
    complete: vi.fn(),
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
  AudioPlayerWithContext: () => null,
}));

vi.mock('@/lib/ai', () => ({
  estimateTokenCount: vi.fn((text: string) => Math.ceil(text.length / 4)),
  GEMINI_CHARS_PER_TOKEN: 4,
  GEMINI_STREAMING_ENABLED: false,
  getCharactersLimit: vi.fn((model?: string, isPaidUser?: boolean) => {
    if (model === 'gpro') {
      return isPaidUser ? 2000 : 1000;
    }

    if (model === 'grok') {
      return isPaidUser ? 2000 : 1000;
    }

    return isPaidUser ? 1000 : 500;
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
  dailyLimitError: 'Daily limit reached (__COUNT__)',
  downloadAudio: 'Download audio',
  error: 'Something went wrong',
  errorEstimating: 'Failed to estimate credits',
  estimateCreditsButton: 'Estimate credits',
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
    inlineEffectPlaceholder: 'Insert inline effect',
    langAutomatic: 'Automatic',
    langEnglish: 'English',
    languageLabel: 'Language',
    languageSelectPlaceholder: 'Select a language',
    wrappingEffectPlaceholder: 'Wrap selected text',
  },
  notEnoughCredits: 'Not enough credits',
  playAudio: 'Play audio',
  resetPlayer: 'Reset player',
  success: 'Success',
  textAreaPlaceholder: 'Enter text',
  title: 'Generate audio',
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

describe('AudioGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastFn.mockClear();
    mockToastFn.success.mockClear();
    mockToastFn.error.mockClear();
  });

  it('shows the Grok language selector with Automatic first and English second', async () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'grok',
        name: 'eve',
      }),
    });

    const languageLabel = screen.getByText(baseDict.grok.languageLabel);
    expect(languageLabel).toBeInTheDocument();

    const languageField = languageLabel.parentElement;
    expect(languageField).not.toBeNull();

    const trigger = within(languageField as HTMLElement).getByRole('combobox');
    expect(trigger).toHaveTextContent(baseDict.grok.langAutomatic);

    trigger.click();

    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent(baseDict.grok.langAutomatic);
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
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: 'https://example.com/audio.mp3' }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'grok',
        name: 'eve',
      }),
    });

    const languageLabel = screen.getByText(baseDict.grok.languageLabel);
    const languageField = languageLabel.parentElement;
    expect(languageField).not.toBeNull();

    const trigger = within(languageField as HTMLElement).getByRole('combobox');
    trigger.click();

    const arabicEgyptOption = await screen.findByRole('option', {
      name: 'Arabic (Egypt)',
    });
    arabicEgyptOption.click();

    await waitFor(() => {
      expect(trigger).toHaveTextContent('Arabic (Egypt)');
    });

    const editor = document.querySelector('[contenteditable="true"]');
    expect(editor).not.toBeNull();

    editor?.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: 'مرحبا',
        inputType: 'insertText',
      }),
    );

    const generateButton = screen.getByTestId('generate-button');
    generateButton.click();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/generate-voice',
        expect.objectContaining({
          body: JSON.stringify({
            language: 'ar-EG',
            styleVariant: '',
            text: 'مرحبا',
            voice: 'eve',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  it('hides Gemini estimate credits UI for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'grok',
        name: 'eve',
      }),
    });

    expect(
      screen.queryByRole('button', { name: baseDict.estimateCreditsButton }),
    ).not.toBeInTheDocument();
  });

  it('hides the AI enhance button for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'grok',
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

  it('shows Grok TTS editor for Grok voices', async () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        model: 'grok',
        name: 'eve',
      }),
    });

    // GrokTTSEditor is loaded dynamically, wait for it
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /insert inline effect/i }),
      ).toBeInTheDocument();
    });
    // Should render the Tiptap contenteditable editor
    expect(
      document.querySelector('[contenteditable="true"]'),
    ).toBeInTheDocument();
    expect(screen.getByText(baseDict.textAreaPlaceholder)).toBeInTheDocument();
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
      screen.queryByRole('button', { name: /insert inline effect/i }),
    ).not.toBeInTheDocument();
  });
});
