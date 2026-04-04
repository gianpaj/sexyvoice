// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GenerateUI } from './generateui.client';

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

vi.mock('../clone/audio-provider', () => ({
  AudioProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const baseDict = {
  title: 'Generate audio',
  textAreaPlaceholder: 'Enter text',
  estimateCreditsButton: 'Estimate credits',
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
  voiceSelector: {
    title: 'Choose voice',
    description: 'Pick a voice for generation',
    geminiInfo: 'Gemini voice info',
    grokInfo: 'Grok voice info',
    toolTipEmotionTags: 'Emotion tags',
    selectStyleTextareaPlaceholder: 'Describe the speaking style',
  },
  grok: {
    helperText: 'Use Grok tags to control delivery.',
    inlineEffectPlaceholder: 'Insert inline effect',
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
    wrappingTags: {
      soft: 'Soft',
      whisper: 'Whisper',
      loud: 'Loud',
      buildIntensity: 'Build intensity',
      decreaseIntensity: 'Decrease intensity',
      higherPitch: 'Higher pitch',
      lowerPitch: 'Lower pitch',
      slow: 'Slow',
      fast: 'Fast',
      singSong: 'Sing-song',
      singing: 'Singing',
      laughSpeak: 'Laugh-speak',
      emphasis: 'Emphasis',
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

function renderGenerateUI(publicVoices: Tables<'voices'>[]) {
  return render(
    <GenerateUI
      dict={
        baseDict as unknown as typeof import('@/messages/en.json')['generate']
      }
      hasEnoughCredits
      isPaidUser
      locale="en"
      publicVoices={publicVoices}
    />,
  );
}

describe('GenerateUI', () => {
  it('passes Gemini style state to both child components for Gemini voices', () => {
    const geminiVoice = createVoice({
      id: 'voice-gemini',
      name: 'poe',
      model: 'gpro',
    });

    renderGenerateUI([geminiVoice]);

    expect(screen.getByTestId('voice-selector')).toBeInTheDocument();
    expect(screen.getByTestId('audio-generator')).toBeInTheDocument();

    expect(mockVoiceSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: geminiVoice,
        selectedStyle: expect.anything(),
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: geminiVoice,
        selectedStyle: expect.anything(),
        selectedGrokCodec: undefined,
      }),
    );
  });

  it('omits Gemini style and passes Grok codec only to audio generator for Grok voices', () => {
    const grokVoice = createVoice({
      id: 'voice-grok',
      name: 'eve',
      model: 'grok',
    });

    renderGenerateUI([grokVoice]);

    expect(mockVoiceSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: grokVoice,
        selectedStyle: undefined,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: grokVoice,
        selectedStyle: undefined,
        selectedGrokCodec: 'mp3',
      }),
    );
  });

  it('omits Gemini style and Grok codec for Replicate voices', () => {
    const replicateVoice = createVoice({
      id: 'voice-replicate',
      name: 'tara',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
    });

    renderGenerateUI([replicateVoice]);

    expect(mockVoiceSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: replicateVoice,
        selectedStyle: undefined,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: replicateVoice,
        selectedStyle: undefined,
        selectedGrokCodec: undefined,
      }),
    );
  });

  it('uses the featured voice as the initial selected voice when present', () => {
    const firstVoice = createVoice({
      id: 'voice-first',
      name: 'tara',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
    });
    const featuredVoice = createVoice({
      id: 'voice-featured',
      name: 'eve',
      model: 'grok',
    });
    const thirdVoice = createVoice({
      id: 'voice-third',
      name: 'poe',
      model: 'gpro',
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
      name: 'tara',
      model:
        'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
    });
    const secondVoice = createVoice({
      id: 'voice-second',
      name: 'poe',
      model: 'gpro',
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
        selectedVoice: undefined,
        selectedStyle: undefined,
      }),
    );

    expect(mockAudioGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedVoice: undefined,
        selectedStyle: undefined,
        selectedGrokCodec: undefined,
      }),
    );
  });
});
