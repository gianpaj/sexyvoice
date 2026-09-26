// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { getVoiceGroups } from '@/components/voice-groups';
import { VoiceSettingsCard } from '@/components/voice-settings-card';
import { getEmotionTags } from '@/lib/ai';

vi.mock('@/components/audio-provider', () => ({
  AudioProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/audio-player-with-context', () => ({
  AudioPlayerWithContext: () => <div data-testid="audio-player" />,
}));

vi.mock('@/lib/ai', () => ({
  getEmotionTags: vi.fn(() => null),
  getGeminiStyleCharacterLimit: vi.fn((isPaidUser?: boolean) =>
    isPaidUser ? 2500 : 1000,
  ),
}));

vi.mock('@/lib/react-textarea-autosize', () => ({
  resizeTextarea: vi.fn(),
}));

const baseDict = {
  playAudio: 'Play audio',
  voiceSelector: {
    clearFilters: 'Clear',
    description: 'Pick a voice for generation',
    featuredBadge: 'Featured',
    featuredGroupLabel: 'Featured',
    filterGenderLabel: 'Gender',
    filterModelLabel: 'Model',
    footerCount: '{filtered} of {total} voices',
    geminiInfo: 'Gemini voice info',
    grokInfo: 'Grok voice info',
    multilingualGroupLabel: 'Gemini',
    noVoicesFound: 'No voices found',
    noVoicesFoundHint: 'Try a different search or clear the filters.',
    previewVoice: 'Preview {name}',
    searchPlaceholder: 'Search name, style, or model...',
    selectStyleTextareaPlaceholder: 'Describe the speaking style',
    selectVoicePlaceholder: 'Select a voice...',
    stopPreview: 'Stop preview of {name}',
    title: 'Choose voice',
    toolTipEmotionTags: 'Emotion tags',
    voiceListLabel: 'Voices',
  },
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
    sort_order: 1,
    type: null,
    user_id: null,
    ...overrides,
  } as Tables<'voices'>;
}

function renderVoiceSettingsCard(
  overrides: Partial<React.ComponentProps<typeof VoiceSettingsCard>> = {},
) {
  const publicVoices = [
    createVoice({
      id: 'voice-replicate',
      language: 'en',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      name: 'tara',
    }),
    createVoice({
      id: 'voice-gemini',
      language: 'en',
      model: 'gpro',
      name: 'kore',
    }),
    createVoice({
      id: 'voice-grok',
      language: 'en',
      model: 'xai',
      name: 'eve',
    }),
  ];

  const defaultProps: React.ComponentProps<typeof VoiceSettingsCard> = {
    publicVoices,
    selectedStyle: 'soft and breathy',
    selectedVoice: publicVoices[0],
    setSelectedStyle: vi.fn(),
    setSelectedVoice: vi.fn(),
  };

  return render(
    <NextIntlClientProvider locale="en" messages={{ generate: baseDict }}>
      <VoiceSettingsCard {...defaultProps} {...overrides} />
    </NextIntlClientProvider>,
  );
}

describe('VoiceSettingsCard', () => {
  it('renders the style textarea for Gemini voices', () => {
    renderVoiceSettingsCard({
      selectedStyle: 'warm and intimate',
      selectedVoice: createVoice({
        id: 'voice-gemini',
        model: 'gpro',
        name: 'kore',
      }),
    });

    expect(
      screen.getByPlaceholderText(
        baseDict.voiceSelector.selectStyleTextareaPlaceholder,
      ),
    ).toBeInTheDocument();
  });

  it('hides the style textarea for Grok voices', () => {
    renderVoiceSettingsCard({
      selectedStyle: 'should not render',
      selectedVoice: createVoice({
        id: 'voice-grok',
        model: 'xai',
        name: 'eve',
      }),
    });

    expect(
      screen.queryByPlaceholderText(
        baseDict.voiceSelector.selectStyleTextareaPlaceholder,
      ),
    ).not.toBeInTheDocument();
  });

  it('hides the style textarea for Replicate voices', () => {
    renderVoiceSettingsCard({
      selectedStyle: 'should not render',
      selectedVoice: createVoice({
        id: 'voice-replicate',
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
        name: 'tara',
      }),
    });

    expect(
      screen.queryByPlaceholderText(
        baseDict.voiceSelector.selectStyleTextareaPlaceholder,
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the Grok tooltip copy for Grok voices', async () => {
    const user = userEvent.setup();

    renderVoiceSettingsCard({
      selectedVoice: createVoice({
        id: 'voice-grok',
        model: 'xai',
        name: 'eve',
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

    renderVoiceSettingsCard({
      selectedVoice: createVoice({
        id: 'voice-gemini',
        model: 'gpro',
        name: 'kore',
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

    renderVoiceSettingsCard({
      selectedVoice: createVoice({
        id: 'voice-replicate',
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
        name: 'tara',
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

  it('passes the selected voice to the emotion-tag lookup', () => {
    const spanishTags =
      '<groan>, <chuckle>, <gasp>, <resoplido>, <laugh>, <yawn>, <cough>';
    vi.mocked(getEmotionTags).mockClear().mockReturnValue(spanishTags);
    const gemini38 = createVoice({
      id: 'voice-gemini-38',
      language: 'es-ES 🇪🇸',
      model: 'gpro38',
      name: 'es-es-tutor-12',
      sample_prompt: 'Hola',
    });

    renderVoiceSettingsCard({ selectedVoice: gemini38 });

    expect(getEmotionTags).toHaveBeenCalledWith(gemini38);
  });

  it('shows the selected voice name in the trigger button', () => {
    renderVoiceSettingsCard({
      selectedVoice: createVoice({
        id: 'voice-grok',
        model: 'xai',
        name: 'eve',
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
          language: 'multiple',
          model: 'gpro',
          name: 'zephyr',
          sort_order: 0,
        }),
        createVoice({
          id: 'voice-featured-achernar',
          language: 'multiple',
          model: 'gpro',
          name: 'achernar',
          sort_order: 0,
        }),
        createVoice({
          id: 'voice-grok-sal',
          language: 'multiple',
          model: 'xai',
          name: 'sal',
          sort_order: 1,
        }),
        createVoice({
          id: 'voice-grok-ara',
          language: 'multiple',
          model: 'xai',
          name: 'ara',
          sort_order: 1,
        }),
        createVoice({
          id: 'voice-replicate-dan',
          language: 'en-GB 🇬🇧',
          model:
            'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
          name: 'dan',
          sort_order: 2,
        }),
        createVoice({
          id: 'voice-replicate-emma',
          language: 'en-US 🇺🇸',
          model:
            'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
          name: 'emma',
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
    renderVoiceSettingsCard({
      publicVoices: [
        createVoice({
          id: 'voice-replicate',
          language: 'en',
          model:
            'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
          name: 'tara',
        }),
        createVoice({
          id: 'voice-grok',
          language: 'en',
          model: 'xai',
          name: 'eve',
          sort_order: 0,
        }),
      ],
      selectedVoice: createVoice({
        id: 'voice-grok',
        language: 'en',
        model: 'xai',
        name: 'eve',
        sort_order: 0,
      }),
    });

    expect(screen.getByRole('combobox')).toHaveTextContent(/eve/i);
    expect(baseDict.voiceSelector.multilingualGroupLabel).toBe(
      baseDict.voiceSelector.multilingualGroupLabel,
    );
  });
});

describe('Featured voices shared across Gemini models', () => {
  const featured = (model: string) =>
    createVoice({
      id: `achernar-${model}`,
      language: 'multiple',
      model,
      name: 'achernar',
      sort_order: 0,
    });

  it('lists the Gemini 3.8 voice before the same-named 3.1 voice', () => {
    const [featuredGroup] = getVoiceGroups(
      [featured('gpro31'), featured('gpro38')],
      {
        featuredGroupLabel: baseDict.voiceSelector.featuredGroupLabel,
        geminiGroupLabel: baseDict.voiceSelector.multilingualGroupLabel,
      },
    );

    expect(featuredGroup.voices.map((voice) => voice.id)).toEqual([
      'achernar-gpro38',
      'achernar-gpro31',
    ]);
  });
});

describe('Gemini 3.8 display names', () => {
  it('shows Clara and selects her catalog ID when searching by display name', async () => {
    const user = userEvent.setup();
    const setSelectedVoice = vi.fn();
    const clara = createVoice({
      id: 'clara-catalog-id',
      model: 'gpro38',
      name: 'es-es-advisor-8',
      type: 'Female',
    });
    renderVoiceSettingsCard({
      publicVoices: [clara],
      selectedVoice: undefined,
      setSelectedVoice,
    });
    await user.click(screen.getByRole('combobox'));
    await user.type(
      screen.getByPlaceholderText(baseDict.voiceSelector.searchPlaceholder),
      'Clara',
    );
    await user.click(
      within(screen.getByRole('option', { name: /Clara/ })).getByRole(
        'button',
        { name: /Clara/ },
      ),
    );
    expect(setSelectedVoice).toHaveBeenCalledWith('clara-catalog-id');
    expect(clara.name).toBe('es-es-advisor-8');
  });

  it('keeps provider IDs searchable and labels the selected sample with the friendly name', async () => {
    const user = userEvent.setup();
    const clara = createVoice({
      id: 'clara-catalog-id',
      model: 'gpro38',
      name: 'es-es-advisor-8',
      sample_url: 'https://example.com/clara.mp3',
    });
    renderVoiceSettingsCard({ publicVoices: [clara], selectedVoice: clara });
    expect(screen.getAllByText('Clara').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('combobox'));
    await user.type(
      screen.getByPlaceholderText(baseDict.voiceSelector.searchPlaceholder),
      'es-es-advisor-8',
    );
    expect(screen.getByRole('option', { name: /Clara/ })).toBeInTheDocument();
  });
});
