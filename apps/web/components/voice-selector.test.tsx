// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VoiceSelector } from '@/components/voice-selector';

vi.mock('@/app/[lang]/(dashboard)/dashboard/clone/audio-provider', () => ({
  AudioProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/audio-player-with-context', () => ({
  AudioPlayerWithContext: () => <div data-testid="audio-player" />,
}));

vi.mock('@/lib/ai', () => ({
  getEmotionTags: vi.fn(() => null),
}));

vi.mock('@/lib/react-textarea-autosize', () => ({
  resizeTextarea: vi.fn(),
}));

const baseDict = {
  playAudio: 'Play audio',
  voiceSelector: {
    title: 'Choose voice',
    description: 'Pick a voice for generation',
    geminiInfo: 'Gemini voice info',
    grokInfo: 'Grok voice info',
    toolTipEmotionTags: 'Emotion tags',
    selectStyleTextareaPlaceholder: 'Describe the speaking style',
    featuredBadge: 'Featured',
    featuredGroupLabel: 'Featured',
    multilingualGroupLabel: 'Multilingual 🌍',
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

function renderVoiceSelector(
  overrides: Partial<React.ComponentProps<typeof VoiceSelector>> = {},
) {
  const publicVoices = [
    createVoice({
      id: 'voice-replicate',
      name: 'tara',
      language: 'en',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
    }),
    createVoice({
      id: 'voice-gemini',
      name: 'kore',
      language: 'en',
      model: 'gpro',
    }),
    createVoice({
      id: 'voice-grok',
      name: 'eve',
      language: 'en',
      model: 'grok',
    }),
  ];

  const defaultProps: React.ComponentProps<typeof VoiceSelector> = {
    dict: baseDict as unknown as typeof import('@/messages/en.json')['generate'],
    publicVoices,
    selectedStyle: 'soft and breathy',
    selectedVoice: publicVoices[0],
    setSelectedStyle: vi.fn(),
    setSelectedVoice: vi.fn(),
    setUseNewModel: vi.fn(),
  };

  return render(<VoiceSelector {...defaultProps} {...overrides} />);
}

describe('VoiceSelector', () => {
  it('renders the style textarea for Gemini voices', () => {
    renderVoiceSelector({
      selectedVoice: createVoice({
        id: 'voice-gemini',
        name: 'kore',
        model: 'gpro',
      }),
      selectedStyle: 'warm and intimate',
    });

    expect(
      screen.getByPlaceholderText(
        baseDict.voiceSelector.selectStyleTextareaPlaceholder,
      ),
    ).toBeInTheDocument();
  });

  it('hides the style textarea for Grok voices', () => {
    renderVoiceSelector({
      selectedVoice: createVoice({
        id: 'voice-grok',
        name: 'eve',
        model: 'grok',
      }),
      selectedStyle: 'should not render',
    });

    expect(
      screen.queryByPlaceholderText(
        baseDict.voiceSelector.selectStyleTextareaPlaceholder,
      ),
    ).not.toBeInTheDocument();
  });

  it('hides the style textarea for Replicate voices', () => {
    renderVoiceSelector({
      selectedVoice: createVoice({
        id: 'voice-replicate',
        name: 'tara',
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      }),
      selectedStyle: 'should not render',
    });

    expect(
      screen.queryByPlaceholderText(
        baseDict.voiceSelector.selectStyleTextareaPlaceholder,
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the Grok tooltip copy for Grok voices', async () => {
    const user = userEvent.setup();

    renderVoiceSelector({
      selectedVoice: createVoice({
        id: 'voice-grok',
        name: 'eve',
        model: 'grok',
      }),
    });

    await user.hover(screen.getByRole('button', { name: '' }));

    expect(
      await screen.findAllByText(baseDict.voiceSelector.grokInfo),
    ).toHaveLength(2);
    expect(
      screen.queryByText(baseDict.voiceSelector.geminiInfo),
    ).not.toBeInTheDocument();
  });

  it('shows the Gemini tooltip copy for Gemini voices', async () => {
    const user = userEvent.setup();

    renderVoiceSelector({
      selectedVoice: createVoice({
        id: 'voice-gemini',
        name: 'kore',
        model: 'gpro',
      }),
    });

    await user.hover(screen.getByRole('button', { name: '' }));

    expect(
      await screen.findAllByText(baseDict.voiceSelector.geminiInfo),
    ).toHaveLength(2);
    expect(
      screen.queryByText(baseDict.voiceSelector.grokInfo),
    ).not.toBeInTheDocument();
  });

  it('shows the Replicate fallback tooltip copy for Replicate voices', async () => {
    const user = userEvent.setup();

    renderVoiceSelector({
      selectedVoice: createVoice({
        id: 'voice-replicate',
        name: 'tara',
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      }),
    });

    await user.hover(screen.getByRole('button', { name: '' }));

    expect(
      await screen.findAllByText(
        /Model: Orpheus-TTS \(text-to-speech AI model\)/,
      ),
    ).toHaveLength(2);
    expect(
      screen.queryByText(baseDict.voiceSelector.geminiInfo),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(baseDict.voiceSelector.grokInfo),
    ).not.toBeInTheDocument();
  });

  it('exposes the featured badge copy in the selected value for the featured voice', () => {
    renderVoiceSelector({
      selectedVoice: createVoice({
        id: 'voice-grok',
        name: 'eve',
        model: 'grok',
      }),
    });

    expect(screen.getByRole('combobox')).toHaveTextContent(/eve/i);
    expect(screen.getByRole('combobox')).toHaveTextContent(/featured/i);
  });

  it('provides dedicated selector group labels for featured and multilingual voices', () => {
    expect(baseDict.voiceSelector.featuredGroupLabel).toBe('Featured');
    expect(baseDict.voiceSelector.multilingualGroupLabel).toBe(
      'Multilingual 🌍',
    );
  });

  it('keeps the featured grok voice selected while using multilingual grouping copy', () => {
    renderVoiceSelector({
      publicVoices: [
        createVoice({
          id: 'voice-replicate',
          name: 'tara',
          language: 'en',
          model:
            'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
        }),
        createVoice({
          id: 'voice-grok',
          name: 'eve',
          language: 'en',
          model: 'grok',
        }),
      ],
      selectedVoice: createVoice({
        id: 'voice-grok',
        name: 'eve',
        language: 'en',
        model: 'grok',
      }),
    });

    expect(screen.getByRole('combobox')).toHaveTextContent(/eve/i);
    expect(baseDict.voiceSelector.multilingualGroupLabel).toBe(
      'Multilingual 🌍',
    );
  });
});
