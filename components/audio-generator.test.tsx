// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioGenerator } from '@/components/audio-generator';

const mockToastFn = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
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

vi.mock('@/components/PulsatingDots', () => ({
  default: () => <span data-testid="pulsating-dots" />,
}));

vi.mock('@/lib/ai', () => ({
  getCharactersLimit: vi.fn((model?: string, isPaidUser?: boolean) => {
    if (model === 'gpro') {
      return isPaidUser ? 2000 : 1000;
    }

    if (model === 'grok') {
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

function renderAudioGenerator(
  overrides: Partial<React.ComponentProps<typeof AudioGenerator>> = {},
) {
  const defaultProps: React.ComponentProps<typeof AudioGenerator> = {
    dict: baseDict as unknown as typeof import('@/messages/en.json')['generate'],
    hasEnoughCredits: true,
    isPaidUser: true,
    selectedStyle: 'moan softly',
    selectedVoice: createVoice(),
    selectedGrokCodec: undefined,
  };

  return render(<AudioGenerator {...defaultProps} {...overrides} />);
}

describe('AudioGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastFn.mockClear();
    mockToastFn.success.mockClear();
    mockToastFn.error.mockClear();
  });

  it('hides Gemini estimate credits UI for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        name: 'eve',
        model: 'grok',
      }),
      selectedGrokCodec: 'mp3',
    });

    expect(
      screen.queryByRole('button', { name: baseDict.estimateCreditsButton }),
    ).not.toBeInTheDocument();
  });

  it('hides the AI enhance button for Grok voices', () => {
    renderAudioGenerator({
      selectedVoice: createVoice({
        name: 'eve',
        model: 'grok',
      }),
      selectedGrokCodec: 'mp3',
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
        model: 'grok',
      }),
      selectedGrokCodec: 'wav',
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
        name: 'tara',
        model:
          'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      }),
    });

    expect(
      screen.queryByRole('button', { name: /insert inline effect/i }),
    ).not.toBeInTheDocument();
  });
});
