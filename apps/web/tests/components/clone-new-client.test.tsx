// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NewVoiceClient from '@/app/[lang]/(dashboard)/dashboard/clone/new.client';
import type { SavedCallVoice } from '@/lib/call-voices';
import { CLONE_SUPPORTED_LOCALE_CODES } from '@/lib/clone/constants';
import type { Locale } from '@/lib/i18n/i18n-config';
import daMessages from '@/messages/da.json';
import deMessages from '@/messages/de.json';
import enMessages from '@/messages/en.json';
import esMessages from '@/messages/es.json';
import frMessages from '@/messages/fr.json';
import itMessages from '@/messages/it.json';

const {
  fetchMock,
  mockEnsureLoaded,
  mockFFmpegState,
  mockAddFiles,
  mockUpload,
  mockLanguageSelect,
  mockToastError,
  mockToastSuccess,
  mockNavigate,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  mockAddFiles: vi.fn(),
  mockUpload: { files: [] as { file: File; id: string }[] },
  mockEnsureLoaded: vi.fn().mockResolvedValue(undefined),
  mockFFmpegState: { isLoading: false },
  mockLanguageSelect: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockNavigate: vi.fn(),
}));

const selectedFile = new File([new Uint8Array([1, 2, 3])], 'reference.wav', {
  type: 'audio/wav',
});

vi.mock('@/lib/i18n/navigation', () => ({
  useRouter: () => ({ push: mockNavigate }),
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/audio-provider', () => ({
  AudioProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Stubbed so the locale ordering computed by new.client.tsx can be asserted on
// directly, without opening a Radix Select in jsdom.
vi.mock(
  '@/app/[lang]/(dashboard)/dashboard/clone/clone-language-select',
  () => ({
    CloneLanguageSelect: (props: { supportedLocales: { code: string }[] }) => {
      mockLanguageSelect(props);
      return <div data-testid="clone-language-select" />;
    },
  }),
);

vi.mock('@/app/[lang]/tools/audio-converter/hooks/use-ffmpeg', () => ({
  useFFmpeg: () => ({
    convert: vi.fn(),
    ensureLoaded: mockEnsureLoaded,
    isLoading: mockFFmpegState.isLoading,
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
      errors: [],
      files: mockUpload.files,
      isDragging: false,
    },
    {
      addFiles: mockAddFiles,
      clearErrors: vi.fn(),
      getInputProps: vi.fn(() => ({})),
      handleDragEnter: vi.fn(),
      handleDragLeave: vi.fn(),
      handleDragOver: vi.fn(),
      handleDrop: vi.fn(),
      openFileDialog: vi.fn(),
      removeFile: vi.fn(),
    },
  ],
}));

vi.mock('@/hooks/use-media-recorder', () => ({
  default: () => ({
    clearMediaBlob: vi.fn(),
    clearMediaStream: vi.fn(),
    getMediaStream: vi.fn(),
    mediaBlob: null,
    mediaStream: null,
    startRecording: vi.fn(),
    status: 'idle',
    stopRecording: vi.fn(),
  }),
}));

vi.mock('@/lib/download', () => ({
  downloadUrl: vi.fn(),
}));

const errorCodesDict = {
  PROVIDER_UNAVAILABLE:
    '{provider} no está disponible temporalmente. Inténtalo de nuevo.',
} as const;

const dict = {
  savedVoice: enMessages.clone.savedVoice,
  audioConversionFailed: 'Audio conversion failed. Please try recording again.',
  audioConversionFailedWithMessage: 'Audio conversion failed: __ERROR__',
  audioDurationInvalidFallback: 'Audio must be at least __MIN__ seconds.',
  audioDurationInvalidVoxtral:
    'Reference audio must be at least __MIN__ seconds for voice cloning.',
  audioDurationUnknown: 'Could not determine audio duration.',
  audioFileLabel: 'Audio File',
  audioProcessorError: 'Audio Processor Error',
  cancelButton: 'Cancel',
  convertingAudio: 'Converting audio',
  crossLanguageInfo: {
    description: '',
    example: '',
    title: '',
  },
  ctaButton: 'Generate Audio',
  downloadAudio: 'Download Audio',
  dragDropText: 'Drag & drop or click to browse',
  englishChatterbox: 'English (Chatterbox)',
  errorCloning: 'Failed to clone voice',
  errorEnhancingReferenceAudio: 'Failed to enhance reference audio.',
  errors: {
    audioConversionFailed:
      'Failed to convert audio format. Please upload MP3, OGG, Opus, or WAV.',
    audioConversionRequiredWebm:
      'WebM audio must be converted before uploading. Please try recording again.',
    audioDurationInvalidFallback: 'Audio must be at least __MIN__ seconds.',
    audioDurationInvalidVoxtral:
      'Reference audio must be at least __MIN__ seconds for voice cloning.',
    audioDurationUnknown: 'Could not determine audio duration.',
    ffmpegLoading:
      'The audio converter is still loading. Please try again in a moment',
    fileTooLarge: 'File size too large. Please use a smaller audio file.',
    insufficientCredits: 'You need __CREDITS__ credits to clone this audio.',
    internalError: 'Failed to clone voice. Please try again.',
    invalidContentType: 'The upload request is invalid. Please try again.',
    invalidFileType:
      'Invalid file type. Please upload MP3, OGG, Opus, M4A, WAV, or WebM.',
    missingLocale: 'Please select a language.',
    missingRequiredParameters: 'Please enter text and select an audio file.',
    noAudioFile: 'Please select an audio file.',
    noText: 'Please enter some text to convert to speech.',
    referenceAudioEnhancementInputTooLarge:
      'The reference audio is too large to enhance.',
    referenceAudioEnhancementInputTooLong:
      'Reference audio cleanup supports clips up to __MAX__ seconds.',
    textTooLong: 'Text exceeds the maximum length of __MAX__ characters.',
    unsupportedAudioFormat:
      'Unsupported audio format for voice cloning. Please use MP3, OGG/Opus, WebM, or WAV.',
    unsupportedLocale: 'This language is not supported for voice cloning.',
    userNotFound: 'Please sign in to clone a voice.',
  },
  errorTitle: 'Error',
  errorTooLarge: 'File size too large. Please use a smaller audio file.',
  failedToLoadAudioProcessor: 'Failed to load audio processor',
  failedToStartRecording: 'Failed to start recording: __ERROR__',
  fileFormatsText: 'MP3, WAV, M4A, OGG or OPUS (WhatsApp) (max. __SIZE__)',
  generating: 'Generating',
  languageLabel: 'Language',
  languageSelectPlaceholder: 'Select a language',
  legalConsentCheckbox:
    'By using voice cloning, you certify that you have all legal consents/rights to clone these voice samples and that you will not use anything generated for illegal or harmful purposes.',
  loadingAudioProcessor: 'Loading audio processor...',
  microphoneError: 'Microphone error',
  notEnoughCredits: "You don't have enough credits to generate audio.",
  orUseMicrophone: 'or use your microphone',
  paidTextLimitTooltip:
    'Paid users can clone longer speech with up to __MAX__ characters.',
  playAudio: 'Play Audio',
  preparingAudioProcessor: 'Preparing audio processor for __LANGUAGE__...',
  previewTitle: 'Generated Voice Preview',
  referenceAudioEnhancementHelp:
    'Optionally denoise and clean the reference clip before cloning. Best for noisy or imperfect recordings.',
  referenceAudioEnhancementLabel: 'Reference audio enhancement',
  referenceAudioGuidanceLong:
    'Use a clear reference clip at least __MIN__ seconds long. Only the first __TRIM_SECONDS__ seconds are used.',
  referenceAudioGuidanceShort:
    'Use a clean single-speaker reference clip at least __MIN__ seconds long. Only the first __TRIM_SECONDS__ seconds are used.',
  removeFile: 'Remove file',
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
  unexpectedError: 'Unexpected error occurred',
  upgradeTextLimitTooltip:
    'Upgrade to a paid plan to clone longer speech with up to __MAX__ characters.',
  uploadAudioFile: 'Upload audio file',
} as const;

const renderClone = (
  props: {
    savedVoices?: SavedCallVoice[];
    cloneMessages?: AbstractIntlMessages;
    hasEnoughCredits?: boolean;
    initialSaveForCalls?: boolean;
    initialDemo?: {
      speakerId: string;
      takeId: 'natural' | 'sarcastic' | 'calmSlow';
    };
    lang?: Locale;
    userHasPaid?: boolean;
    voiceUsers?: Record<string, string[]>;
  } = {},
) =>
  render(
    <NextIntlClientProvider
      locale="es"
      messages={{
        call: enMessages.call,
        clone: props.cloneMessages ?? dict,
        errorCodes: errorCodesDict,
        generate: enMessages.generate,
        landing: enMessages.landing,
        ttsEditor: enMessages.ttsEditor,
      }}
    >
      <NewVoiceClient
        hasEnoughCredits={props.hasEnoughCredits ?? true}
        initialDemo={props.initialDemo}
        initialSaveForCalls={props.initialSaveForCalls}
        lang={props.lang ?? 'en'}
        savedVoices={props.savedVoices}
        userHasPaid={props.userHasPaid ?? false}
        voiceUsers={props.voiceUsers}
      />
    </NextIntlClientProvider>,
  );

const renderedLocaleCodes = () => {
  const lastCall = mockLanguageSelect.mock.lastCall?.[0] as {
    supportedLocales: { code: string }[];
  };
  return lastCall.supportedLocales.map((locale) => locale.code);
};

describe('NewVoiceClient', () => {
  it('saves a reusable voice without requiring generated speech text', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ audioReferenceId: 'reference', provider: 'inworld' }),
        {
          status: 200,
        },
      ),
    );
    const user = userEvent.setup();
    renderClone({
      initialSaveForCalls: true,
      userHasPaid: true,
      hasEnoughCredits: false,
      cloneMessages: enMessages.clone,
    });
    expect(
      screen.queryByLabelText(enMessages.clone.textToConvertLabel),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText(enMessages.clone.savedVoice.name),
      'My voice',
    );
    await user.click(screen.getByTestId('clone-legal-consent'));
    await user.click(screen.getByTestId('clone-generate-button'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('saveVoiceName')).toBe('My voice');
    expect(body.get('voiceConsent')).toBe('true');
    expect(
      screen.getByRole('link', { name: enMessages.clone.savedVoice.useInCall }),
    ).toHaveAttribute('href', '/dashboard/call?custom=1&voice=reference');
    expect(screen.getByRole('radio', { name: /My voice/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play My voice sample' }),
    ).toBeInTheDocument();
  });

  const inworldVoice: SavedCallVoice = {
    id: 'inworld-reference',
    name: 'My Inworld voice',
    locale: 'en',
    provider: 'inworld',
  };
  const mistralVoice: SavedCallVoice = {
    id: 'mistral-reference',
    name: 'My Mistral voice',
    locale: 'pl',
    provider: 'mistral',
  };

  it('generates speech with a selected saved voice instead of a recording', async () => {
    mockUpload.files = [];
    const user = userEvent.setup();
    renderClone({
      cloneMessages: enMessages.clone,
      savedVoices: [inworldVoice, mistralVoice],
      userHasPaid: true,
    });
    expect(
      screen.getByRole('heading', { name: 'Your voices' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /My Inworld voice/ }));

    expect(
      screen.getByText(
        enMessages.clone.savedVoice.using.replace('{name}', 'My Inworld voice'),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('clone-legal-consent')).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText(enMessages.clone.textToConvertLabel),
      'Hello there',
    );
    await user.click(screen.getByTestId('clone-generate-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('savedVoiceId')).toBe('inworld-reference');
    expect(body.get('locale')).toBe('en');
    expect(body.get('text')).toBe('Hello there');
    expect(body.get('file')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('deletes a saved voice after naming the characters that use it', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ deleted: true }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderClone({
      cloneMessages: enMessages.clone,
      savedVoices: [inworldVoice, mistralVoice],
      userHasPaid: true,
      voiceUsers: { 'inworld-reference': ['Max', 'Lily'] },
    });
    await user.click(screen.getByRole('radio', { name: /My Inworld voice/ }));

    await user.click(
      screen.getByRole('button', { name: 'Delete My Inworld voice' }),
    );
    expect(screen.getByText(/^Used by Max .+ Lily\./)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: enMessages.clone.savedVoice.deleteConfirm,
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('radio', { name: /My Inworld voice/ }),
      ).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/audio-references/inworld-reference',
      { method: 'DELETE' },
    );
    // The deleted voice was selected, so the recording input is back.
    expect(screen.getByTestId('clone-legal-consent')).toBeInTheDocument();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFFmpegState.isLoading = false;
    mockUpload.files = [{ file: selectedFile, id: 'selected-file' }];
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ url: 'https://files.sexyvoice.ai/generated.wav' }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads a selected demo reference and tagged sentence without generating', async () => {
    mockUpload.files = [];
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    renderClone({ initialDemo: { speakerId: 'heike', takeId: 'calmSlow' } });
    const input = await screen.findByTestId('clone-text-input');
    expect(input).toHaveTextContent(
      'Ach, da bist du ja genau im richtigen Moment.',
    );
    await waitFor(() => expect(mockAddFiles).toHaveBeenCalledOnce());
    const [file] = mockAddFiles.mock.calls[0][0] as File[];
    expect(file.name).toBe('heike-reference.mp3');
    expect(file.type).toBe('audio/mpeg');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/demo-clones/voxtral-3/heike-reference.mp3',
    );
    expect(screen.getByTestId('clone-legal-consent')).not.toBeChecked();
  });

  it.each(['http', 'network'])(
    'shows a demo reference %s failure',
    async (failure) => {
      mockUpload.files = [];
      if (failure === 'http') {
        fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
      } else {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      }

      renderClone({ initialDemo: { speakerId: 'heike', takeId: 'calmSlow' } });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        enMessages.landing.demoClone.audioError,
      );
      expect(mockAddFiles).not.toHaveBeenCalled();
      expect(screen.getByTestId('clone-generate-button')).toBeDisabled();
    },
  );

  it('keeps a user reference when a demo download completes', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    renderClone({ initialDemo: { speakerId: 'kat', takeId: 'sarcastic' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(mockAddFiles).not.toHaveBeenCalled();
  });

  it('updates text direction without clearing text when switching languages', async () => {
    const user = userEvent.setup();
    renderClone();

    const input = await screen.findByTestId('clone-text-input');
    const text = 'Keep this text when switching languages.';
    await user.type(input, text);
    expect(input).toHaveAttribute('dir', 'ltr');

    for (const code of CLONE_SUPPORTED_LOCALE_CODES) {
      act(() => {
        mockLanguageSelect.mock.lastCall?.[0].dispatch({
          patch: { selectedLocaleCode: code },
          type: 'patch',
        });
      });
      const currentInput = await screen.findByTestId('clone-text-input');
      expect(currentInput).toHaveAttribute(
        'dir',
        code === 'ar' || code === 'he' ? 'rtl' : 'ltr',
      );
      if (currentInput instanceof HTMLTextAreaElement) {
        expect(currentInput).toHaveValue(text);
      } else {
        expect(currentInput).toHaveTextContent(text);
      }
    }

    act(() => {
      mockLanguageSelect.mock.lastCall?.[0].dispatch({
        patch: { selectedLocaleCode: 'en' },
        type: 'patch',
      });
    });
    const currentInput = await screen.findByTestId('clone-text-input');
    expect(currentInput).toHaveAttribute('dir', 'ltr');
    expect(currentInput).toHaveTextContent(text);
  });

  it.each([
    ['fr', 'Français'],
    ['pl', 'Polonais'],
    ['ca', 'Catalan'],
  ])(
    'uses the translated name for %s in the audio loading message',
    (code, name) => {
      mockFFmpegState.isLoading = true;
      renderClone({ lang: 'fr' });

      act(() => {
        mockLanguageSelect.mock.lastCall?.[0].dispatch({
          patch: { selectedLocaleCode: code },
          type: 'patch',
        });
      });

      expect(
        screen.getByText(`Preparing audio processor for ${name}...`),
      ).toBeInTheDocument();
    },
  );

  it.each(['da', 'fi', 'en-multi', 'en'])(
    'hides the preparation message when switching from French to %s',
    (code) => {
      mockFFmpegState.isLoading = true;
      renderClone({ lang: 'fr' });

      act(() => {
        mockLanguageSelect.mock.lastCall?.[0].dispatch({
          patch: { selectedLocaleCode: 'fr' },
          type: 'patch',
        });
      });
      // The fixture supplies English copy; lang: 'fr' localizes the language name.
      expect(
        screen.getByText('Preparing audio processor for Français...'),
      ).toBeInTheDocument();

      act(() => {
        mockLanguageSelect.mock.lastCall?.[0].dispatch({
          patch: { selectedLocaleCode: code },
          type: 'patch',
        });
      });
      expect(
        screen.queryByText(/Preparing audio processor for/),
      ).not.toBeInTheDocument();
    },
  );

  it('offers the confirmed additional languages with localized names', () => {
    renderClone();
    const lastCall = mockLanguageSelect.mock.lastCall?.[0] as {
      supportedLocales: { code: string; name: string }[];
    };
    expect(lastCall.supportedLocales).toEqual(
      expect.arrayContaining([
        { code: 'ca', name: 'Catalan' },
        { code: 'hu', name: 'Hungarian' },
        { code: 'pl', name: 'Polish' },
        { code: 'ro', name: 'Romanian' },
        { code: 'uk', name: 'Ukrainian' },
        { code: 'vi', name: 'Vietnamese' },
      ]),
    );
  });

  it('lists the page locale first in the language select', () => {
    renderClone({ lang: 'it' });

    expect(renderedLocaleCodes()[0]).toBe('it');
  });

  it.each([
    ['en', enMessages, 'English (Chatterbox)'],
    ['es', esMessages, 'Inglés (Chatterbox)'],
    ['de', deMessages, 'Englisch (Chatterbox)'],
    ['da', daMessages, 'Engelsk (Chatterbox)'],
    ['it', itMessages, 'Inglese (Chatterbox)'],
    ['fr', frMessages, 'Anglais (Chatterbox)'],
  ] as const)(
    'labels Chatterbox English distinctly in %s',
    (lang, messages, name) => {
      renderClone({ cloneMessages: messages.clone, lang });

      const lastCall = mockLanguageSelect.mock.lastCall?.[0] as {
        supportedLocales: { code: string; name: string }[];
      };
      expect(
        lastCall.supportedLocales.find(({ code }) => code === 'en-multi')?.name,
      ).toBe(name);
      expect(
        lastCall.supportedLocales.find(({ code }) => code === 'en')?.name,
      ).not.toBe(name);
    },
  );

  it('keeps every supported locale when the page locale is hoisted', () => {
    renderClone({ lang: 'it' });

    const codes = renderedLocaleCodes();
    expect(codes).toHaveLength(new Set(codes).size);
    expect([...codes].sort()).toEqual([...CLONE_SUPPORTED_LOCALE_CODES].sort());
    expect(codes).toContain('en');
    expect(codes).toContain('es');
  });

  it('hoists each website locale in turn', () => {
    for (const lang of ['en', 'es', 'de', 'da', 'it', 'fr'] as const) {
      mockLanguageSelect.mockClear();
      const { unmount } = renderClone({ lang });

      expect(renderedLocaleCodes()[0]).toBe(lang);
      unmount();
    }
  });

  it('renders reference audio enhancement unchecked by default', () => {
    renderClone();

    expect(
      screen.getByRole('checkbox', {
        name: dict.referenceAudioEnhancementLabel,
      }),
    ).not.toBeChecked();
  });

  it('shows the free Voxtral text limit by default', () => {
    renderClone();

    expect(screen.getByText('0 / 1000')).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        'Upgrade to a paid plan to clone longer speech with up to 4000 characters.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the paid Voxtral text limit for paid users', () => {
    renderClone({ userHasPaid: true });

    expect(screen.getByText('0 / 4000')).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        'Paid users can clone longer speech with up to 4000 characters.',
      ),
    ).toBeInTheDocument();
  });

  it('submits enhanceReferenceAudio=true when the toggle is enabled', async () => {
    const user = userEvent.setup();

    renderClone();

    await user.type(
      await screen.findByLabelText(dict.textToConvertLabel),
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

  it.each(['Mistral', 'Replicate'] as const)(
    'renders localized %s provider errors',
    async (provider) => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'PROVIDER_UNAVAILABLE',
            details: { provider },
            error: `${provider} is temporarily unavailable. Please retry. (503)`,
            serverMessage: `${provider} is temporarily unavailable. Please retry.`,
            status: 503,
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 503,
          },
        ),
      );

      renderClone();

      await user.type(
        await screen.findByLabelText(dict.textToConvertLabel),
        'Hello world',
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

      expect(
        await screen.findByText(
          `${provider} no está disponible temporalmente. Inténtalo de nuevo.`,
        ),
      ).toBeInTheDocument();
    },
  );

  it('renders translated clone errors from API error codes', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'errors.insufficientCredits',
          details: { CREDITS: 252 },
          error:
            'Insufficient credits. You need 252 credits to clone this audio',
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 402,
        },
      ),
    );

    renderClone();

    await user.type(
      await screen.findByLabelText(dict.textToConvertLabel),
      'Hello world',
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

    expect(
      await screen.findByText('You need 252 credits to clone this audio.'),
    ).toBeInTheDocument();
  });
});
