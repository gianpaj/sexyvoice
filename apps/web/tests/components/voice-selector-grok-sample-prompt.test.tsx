// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { VoiceSelector } from '@/components/voice-selector';

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
    featuredGroupLabel: 'Grok',
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
    model: 'xai',
    name: 'eve',
    sample_prompt:
      '<emphasis>Unfortunately for your team she was waiting.</emphasis>[long-pause]',
    sample_url: 'https://files.sexyvoice.ai/sample.mp3',
    sort_order: 0,
    type: null,
    user_id: null,
    ...overrides,
  } as Tables<'voices'>;
}

function renderVoiceSelector(selectedVoice: Tables<'voices'>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ generate: baseDict }}>
      <VoiceSelector
        publicVoices={[selectedVoice]}
        selectedStyle={undefined}
        selectedVoice={selectedVoice}
        setSelectedStyle={vi.fn()}
        setSelectedVoice={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe('VoiceSelector Grok sample prompt rendering', () => {
  it('highlights Grok tags for xai voices', () => {
    renderVoiceSelector(createVoice());

    expect(screen.getByText('<emphasis>')).toHaveClass(
      'inline-flex',
      'rounded',
      'font-mono',
    );
    expect(screen.getByText('</emphasis>')).toHaveClass(
      'inline-flex',
      'rounded',
      'font-mono',
    );
    expect(screen.getByText('[long-pause]')).toHaveClass(
      'inline-flex',
      'rounded',
      'font-mono',
    );
    expect(
      screen.getByText('Unfortunately for your team she was waiting.'),
    ).toBeInTheDocument();
  });

  it('keeps non-xai sample prompts as plain text', () => {
    renderVoiceSelector(
      createVoice({
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      }),
    );

    expect(
      screen.getByText(
        '<emphasis>Unfortunately for your team she was waiting.</emphasis>[long-pause]',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('<emphasis>')).not.toBeInTheDocument();
    expect(screen.queryByText('[long-pause]')).not.toBeInTheDocument();
  });
});
