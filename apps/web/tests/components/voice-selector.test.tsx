// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { getVoiceGroups } from '@/components/voice-groups';
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
    multilingualGroupLabel: 'Gemini',
    selectVoicePlaceholder: 'Select a voice...',
    searchPlaceholder: 'Search name, style, or model...',
    filterModelLabel: 'Model',
    filterGenderLabel: 'Gender',
    clearFilters: 'Clear',
    noVoicesFound: 'No voices found',
    noVoicesFoundHint: 'Try a different search or clear the filters.',
    previewVoice: 'Preview {name}',
    stopPreview: 'Stop preview of {name}',
    footerCount: '{filtered} of {total} voices',
    voiceListLabel: 'Voices',
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
    sort_order: 1,
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
      model: 'xai',
    }),
  ];

  const defaultProps: React.ComponentProps<typeof VoiceSelector> = {
    publicVoices,
    selectedStyle: 'soft and breathy',
    selectedVoice: publicVoices[0],
    setSelectedStyle: vi.fn(),
    setSelectedVoice: vi.fn(),
  };

  return render(
    <NextIntlClientProvider locale="en" messages={{ generate: baseDict }}>
      <VoiceSelector {...defaultProps} {...overrides} />
    </NextIntlClientProvider>,
  );
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
        model: 'xai',
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
        model: 'xai',
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

  it('shows the selected voice name in the trigger button', () => {
    renderVoiceSelector({
      selectedVoice: createVoice({
        id: 'voice-grok',
        name: 'eve',
        model: 'xai',
        sort_order: 0,
      }),
    });

    expect(screen.getByRole('combobox')).toHaveTextContent(/eve/i);
  });

  it('keeps featured voices first and preserves query order for non-featured groups', () => {
    const voiceGroups = getVoiceGroups(
      [
        createVoice({
          id: 'voice-featured-zephyr',
          name: 'zephyr',
          language: 'multiple',
          model: 'gpro',
          sort_order: 0,
        }),
        createVoice({
          id: 'voice-featured-achernar',
          name: 'achernar',
          language: 'multiple',
          model: 'gpro',
          sort_order: 0,
        }),
        createVoice({
          id: 'voice-grok-sal',
          name: 'sal',
          language: 'multiple',
          model: 'xai',
          sort_order: 1,
        }),
        createVoice({
          id: 'voice-grok-ara',
          name: 'ara',
          language: 'multiple',
          model: 'xai',
          sort_order: 1,
        }),
        createVoice({
          id: 'voice-replicate-dan',
          name: 'dan',
          language: 'en-GB 🇬🇧',
          model:
            'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
          sort_order: 2,
        }),
        createVoice({
          id: 'voice-replicate-emma',
          name: 'emma',
          language: 'en-US 🇺🇸',
          model:
            'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
          sort_order: 2,
        }),
      ],
      {
        featuredGroupLabel: baseDict.voiceSelector.featuredGroupLabel,
        geminiGroupLabel: baseDict.voiceSelector.multilingualGroupLabel,
      },
    );

    expect(voiceGroups.map((group) => group.label)).toEqual([
      'Featured',
      'Grok ✨',
      'en-GB 🇬🇧',
      'en-US 🇺🇸',
    ]);
    expect(
      voiceGroups.map((group) => group.voices.map((voice) => voice.name)),
    ).toEqual([['achernar', 'zephyr'], ['ara', 'sal'], ['dan'], ['emma']]);
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
          model: 'xai',
          sort_order: 0,
        }),
      ],
      selectedVoice: createVoice({
        id: 'voice-grok',
        name: 'eve',
        language: 'en',
        model: 'xai',
        sort_order: 0,
      }),
    });

    expect(screen.getByRole('combobox')).toHaveTextContent(/eve/i);
    expect(baseDict.voiceSelector.multilingualGroupLabel).toBe(
      baseDict.voiceSelector.multilingualGroupLabel,
    );
  });
});
