// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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
    featuredGroupLabel: 'Grok',
    multilingualGroupLabel: 'Gemini',
  },
} as const;

function createVoice(
  overrides: Partial<Tables<'voices'>> = {},
): Tables<'voices'> {
  return {
    id: 'voice-id',
    name: 'eve',
    language: 'en',
    model: 'xai',
    description: null,
    type: null,
    sort_order: 0,
    feature: 'tts',
    sample_url: 'https://files.sexyvoice.ai/sample.mp3',
    sample_prompt:
      '<emphasis>Unfortunately for your team she was waiting.</emphasis>[long-pause]',
    user_id: null,
    created_at: null,
    ...overrides,
  } as Tables<'voices'>;
}

function renderVoiceSelector(selectedVoice: Tables<'voices'>) {
  return render(
    <VoiceSelector
      dict={
        baseDict as unknown as typeof import('@/messages/en.json')['generate']
      }
      publicVoices={[selectedVoice]}
      selectedStyle={undefined}
      selectedVoice={selectedVoice}
      setSelectedStyle={vi.fn()}
      setSelectedVoice={vi.fn()}
    />,
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
