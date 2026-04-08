// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewVoiceClient from '@/app/[lang]/(dashboard)/dashboard/clone/new.client';

const { fetchMock, mockEnsureLoaded, mockToastError, mockToastSuccess } =
  vi.hoisted(() => ({
    fetchMock: vi.fn(),
    mockEnsureLoaded: vi.fn().mockResolvedValue(undefined),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  }));

const selectedFile = new File([new Uint8Array([1, 2, 3])], 'reference.wav', {
  type: 'audio/wav',
});

vi.mock('@/app/[lang]/(dashboard)/dashboard/clone/audio-provider', () => ({
  AudioProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/app/[lang]/(dashboard)/dashboard/clone/clone-sample-card', () => ({
  default: () => <div data-testid="clone-sample-card" />,
}));

vi.mock('@/app/[lang]/tools/audio-converter/hooks/use-ffmpeg', () => ({
  useFFmpeg: () => ({
    convert: vi.fn(),
    ensureLoaded: mockEnsureLoaded,
    isLoading: false,
  }),
}));

vi.mock('@/components/audio-player-with-context', () => ({
  AudioPlayerWithContext: () => <div data-testid="audio-player" />,
}));

vi.mock('@/components/audio/microphone-main', () => ({
  MicrophoneMain: () => <div data-testid="microphone-main" />,
}));

vi.mock('@/components/services/toast', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock('@/hooks/use-file-upload', () => ({
  formatBytes: () => '1 MB',
  useFileUpload: () => [
    {
      files: [
        {
          file: selectedFile,
          id: 'selected-file',
        },
      ],
      isDragging: false,
      errors: [],
    },
    {
      handleDragEnter: vi.fn(),
      handleDragLeave: vi.fn(),
      handleDragOver: vi.fn(),
      handleDrop: vi.fn(),
      openFileDialog: vi.fn(),
      removeFile: vi.fn(),
      getInputProps: vi.fn(() => ({})),
      clearErrors: vi.fn(),
      addFiles: vi.fn(),
    },
  ],
}));

vi.mock('@/hooks/use-media-recorder', () => ({
  default: () => ({
    status: 'idle',
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    clearMediaStream: vi.fn(),
    clearMediaBlob: vi.fn(),
    mediaStream: null,
    mediaBlob: null,
    getMediaStream: vi.fn(),
  }),
}));

vi.mock('@/lib/download', () => ({
  downloadUrl: vi.fn(),
}));

vi.mock('@/lib/i18n/get-translated-languages', () => ({
  getTranslatedLanguages: (_lang: string, codes: string[]) =>
    codes.map((code) => ({
      label: code.toUpperCase(),
      value: code,
    })),
}));

const dict = {
  audioFileLabel: 'Audio File',
  cancelButton: 'Cancel',
  ctaButton: 'Generate Audio',
  downloadAudio: 'Download Audio',
  dragDropText: 'Drag & drop or click to browse',
  errorCloning: 'Failed to clone voice',
  errorEnhancingReferenceAudio: 'Failed to enhance reference audio.',
  errorTooLarge: 'File size too large. Please use a smaller audio file.',
  errorTitle: 'Error',
  fileFormatsText: 'MP3, WAV, M4A, OGG or OPUS (WhatsApp) (max. __SIZE__)',
  generating: 'Generating',
  languageLabel: 'Language',
  languageSelectPlaceholder: 'Select a language',
  legalConsentCheckbox:
    'By using voice cloning, you certify that you have all legal consents/rights to clone these voice samples and that you will not use anything generated for illegal or harmful purposes.',
  notEnoughCredits: "You don't have enough credits to generate audio.",
  orUseMicrophone: 'or use your microphone',
  playAudio: 'Play Audio',
  previewTitle: 'Generated Voice Preview',
  referenceAudioEnhancementHelp:
    'Optionally denoise and clean the reference clip before cloning. Best for noisy or imperfect recordings.',
  referenceAudioEnhancementLabel: 'Reference audio enhancement',
  sampleCard: {
    exampleOutput: 'Example',
    loadSource: 'Load source',
    sourceAudio: 'Source audio',
  },
  subtitle:
    'Upload an audio file and enter text to create a voice clone and generate speech in one step',
  success: 'Audio generated successfully!',
  tabPreview: 'Preview',
  tabUpload: 'Upload',
  textAreaPlaceholder: 'Enter the text you want to convert to speech...',
  textToConvertLabel: 'Enter text to generate speech',
  title: 'Clone a Voice',
  tryDemo: 'Or try with a demo:',
  uploadAudioFile: 'Upload audio file',
  errors: {
    ffmpegLoading:
      'The audio converter is still loading. Please try again in a moment',
    noAudioFile: 'Please select an audio file.',
    noText: 'Please enter some text to convert to speech.',
  },
  crossLanguageInfo: {
    description: '',
    example: '',
    title: '',
  },
} as const;

describe('NewVoiceClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ url: 'https://files.sexyvoice.ai/generated.wav' }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders reference audio enhancement unchecked by default', () => {
    render(
      <NewVoiceClient
        dict={dict as unknown as typeof import('@/messages/en.json')['clone']}
        hasEnoughCredits
        lang={'en' as any}
      />,
    );

    expect(
      screen.getByRole('checkbox', {
        name: dict.referenceAudioEnhancementLabel,
      }),
    ).not.toBeChecked();
  });

  it('submits enhanceReferenceAudio=true when the toggle is enabled', async () => {
    const user = userEvent.setup();

    render(
      <NewVoiceClient
        dict={dict as unknown as typeof import('@/messages/en.json')['clone']}
        hasEnoughCredits
        lang={'en' as any}
      />,
    );

    await user.type(
      screen.getByLabelText(dict.textToConvertLabel),
      'Hello world',
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: dict.referenceAudioEnhancementLabel,
      }),
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: dict.legalConsentCheckbox,
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: /generate audio/i,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, requestInit] = fetchMock.mock.calls[0];
    const formData = requestInit.body as FormData;

    expect(formData.get('enhanceReferenceAudio')).toBe('true');
    expect(mockToastSuccess).toHaveBeenCalledWith(dict.success);
  });
});
