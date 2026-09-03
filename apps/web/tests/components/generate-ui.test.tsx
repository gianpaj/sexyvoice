// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerateUI } from '@/app/[lang]/(dashboard)/dashboard/generate/generateui.client';

const mockVoiceSelector = vi.fn();
const mockAudioGenerator = vi.fn();

vi.mock('@/components/voice-selector', () => ({
  VoiceSelector: (
    props: React.ComponentProps<
      typeof import('@/components/voice-selector').VoiceSelector
    >,
  ) => {
    mockVoiceSelector(props);
    return <div data-testid="voice-selector" />;
  },
}));

vi.mock('@/components/audio-generator', () => ({
  AudioGenerator: (
    props: React.ComponentProps<
      typeof import('@/components/audio-generator').AudioGenerator
    >,
  ) => {
    mockAudioGenerator(props);
    return <div data-testid="audio-generator" />;
  },
}));

vi.mock('@/components/generation-settings-panel', () => ({
  GenerationSettingsPanel: () => null,
}));

vi.mock('@/components/audio-provider', () => ({
  AudioProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

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

function renderGenerateUI(publicVoices: Tables<'voices'>[]) {
  return render(
    <GenerateUI hasEnoughCredits isPaidUser publicVoices={publicVoices} />,
  );
}

describe('GenerateUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes Gemini style state to both child components for Gemini voices', () => {
    const geminiVoice = createVoice({
      id: 'voice-gemini',
      model: 'gpro',
      name: 'kore',
    });

    renderGenerateUI([geminiVoice]);

    expect(screen.getByTestId('voice-selector')).toBeInTheDocument();
    expect(screen.getByTestId('audio-generator')).toBeInTheDocument();

    act(() => {
      mockVoiceSelector.mock.calls[0][0].setSelectedStyle('Speak warmly');
    });

    expect(mockVoiceSelector).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedStyle: 'Speak warmly',
        selectedVoice: geminiVoice,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedStyle: 'Speak warmly',
        selectedVoice: geminiVoice,
      }),
    );
  });

  it('omits Gemini style for Grok voices', () => {
    const grokVoice = createVoice({
      id: 'voice-grok',
      model: 'xai',
      name: 'eve',
    });

    renderGenerateUI([grokVoice]);

    expect(mockVoiceSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedStyle: undefined,
        selectedVoice: grokVoice,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedStyle: undefined,
        selectedVoice: grokVoice,
      }),
    );
  });

  it('omits Gemini style for Replicate voices', () => {
    const replicateVoice = createVoice({
      id: 'voice-replicate',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      name: 'tara',
    });

    renderGenerateUI([replicateVoice]);

    expect(mockVoiceSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedStyle: undefined,
        selectedVoice: replicateVoice,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedStyle: undefined,
        selectedVoice: replicateVoice,
      }),
    );
  });

  it('uses the featured voice as the initial selected voice when present', () => {
    const firstVoice = createVoice({
      id: 'voice-first',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      name: 'tara',
    });
    const featuredVoice = createVoice({
      id: 'voice-featured',
      model: 'grok',
      name: 'eve',
      sort_order: 0,
    });
    const thirdVoice = createVoice({
      id: 'voice-third',
      model: 'gpro',
      name: 'kore',
    });

    renderGenerateUI([firstVoice, featuredVoice, thirdVoice]);

    expect(mockVoiceSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: featuredVoice,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: featuredVoice,
      }),
    );
  });

  it('uses the first public voice as the initial selected voice when no featured voice is present', () => {
    const firstVoice = createVoice({
      id: 'voice-first',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      name: 'tara',
    });
    const secondVoice = createVoice({
      id: 'voice-second',
      model: 'gpro',
      name: 'kore',
    });

    renderGenerateUI([firstVoice, secondVoice]);

    expect(mockVoiceSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: firstVoice,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: firstVoice,
      }),
    );
  });

  it('falls back to no selected voice when the list is empty', () => {
    renderGenerateUI([]);

    expect(mockVoiceSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedStyle: undefined,
        selectedVoice: undefined,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedStyle: undefined,
        selectedVoice: undefined,
      }),
    );
  });
});
