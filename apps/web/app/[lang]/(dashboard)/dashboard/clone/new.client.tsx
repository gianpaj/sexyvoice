'use client';

import { AlertCircle, CircleStop, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type Dispatch,
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
} from 'react';

import { useFFmpeg } from '@/app/[lang]/tools/audio-converter/hooks/use-ffmpeg';
import { AudioPlayerWithContext } from '@/components/audio-player-with-context';
import { GenerateButton } from '@/components/generate-button';
import { toast } from '@/components/services/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFileUpload } from '@/hooks/use-file-upload';
import useMediaRecorder from '@/hooks/use-media-recorder';
import {
  CLONE_FORM_FIELDS,
  type CloneErrorResponseBody,
  type CloneRouteErrorCode,
  type CloneSuccessResponse,
  type RouteErrorDetails,
} from '@/lib/clone/api-types';
import { VOXTRAL_SUPPORTED_LOCALE_CODES } from '@/lib/clone/constants';
import {
  CLONE_SUPPORTED_LOCALES,
  INWORLD_SUPPORTED_LOCALE_CODES,
} from '@/lib/clone/languages';
import {
  createMicrophoneReferenceAudioFile,
  isWebmAudioBlob,
} from '@/lib/clone/microphone-reference-audio';
import { getCloneTextMaxLength } from '@/lib/clone/text-limits';
import { downloadUrl } from '@/lib/download';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import { AudioProvider } from './audio-provider';
import { CloneAudioInput } from './clone-audio-input';
import { CloneCheckboxes } from './clone-consent-fields';
import { CloneInworldVoiceSelect } from './clone-inworld-voice-select';
import { CloneLanguageSelect } from './clone-language-select';
import { CloneProviderSelect } from './clone-provider-select';
import type { SampleAudio } from './clone-sample-card';
import {
  type AudioReference,
  type CloneState,
  type CloneStateAction,
  cloneStateReducer,
  formatCloneMessage,
  initialCloneState,
} from './clone-state';
import { CloneTextField } from './clone-text-field';
import { CloneVoiceNameField } from './clone-voice-name-field';

export type { Status } from './clone-state';

const ALLOWED_TYPES =
  'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/x-wav,audio/m4a,audio/x-m4a,audio/opus,audio/x-opus,video/webm,.opus';

// The server returns `CloneErrorResponseBody`, but proxies and older responses
// may omit fields, so every field is treated as optional here. `message` is not
// part of the route contract but can arrive from upstream/proxy error bodies.
type CloneErrorResponse = Partial<CloneErrorResponseBody> & {
  message?: string;
};

type CloneTranslator = ReturnType<typeof useTranslations<'clone'>>;
type FileUploadResult = ReturnType<typeof useFileUpload>;
type RecorderResult = ReturnType<typeof useMediaRecorder>;

const getCloneErrorMessage = (
  t: CloneTranslator,
  code?: CloneRouteErrorCode,
  fallbackMessage?: string,
  details?: RouteErrorDetails,
): string => {
  if (!code) {
    return fallbackMessage || t('errorCloning');
  }

  const messageKey = code as Parameters<CloneTranslator>[0];
  if (!t.has(messageKey)) {
    return fallbackMessage || t('errorCloning');
  }

  const message = t(messageKey);
  return formatCloneMessage(message, details ?? {});
};

// ─── PreviewTabContent ────────────────────────────────────────────────────────

function PreviewTabContent({
  generatedAudioUrl,
  downloadAudio,
}: {
  generatedAudioUrl: string | null;
  downloadAudio: () => Promise<void>;
}) {
  const t = useTranslations('clone');

  return (
    <div className="space-y-4">
      <h3 className="text-center font-medium text-xl">{t('previewTitle')}</h3>

      <div className="mx-auto w-fit rounded-lg border bg-muted/30 p-4">
        {generatedAudioUrl && (
          <AudioPlayerWithContext
            autoPlay
            className="rounded-full"
            playAudioTitle={t('playAudio')}
            progressColor="#8b5cf6"
            showWaveform
            url={generatedAudioUrl}
            waveColor="#888888"
          />
        )}
      </div>

      <div className="flex justify-center gap-4">
        <Button className="flex items-center gap-2" onClick={downloadAudio}>
          <Download className="h-4 w-4" />
          {t('downloadAudio')}
        </Button>
      </div>
    </div>
  );
}

function VoiceSetupStepContent({
  dispatch,
  ffmpegError,
  ffmpegLoading,
  fileActions,
  fileState,
  inworldVoices,
  inworldVoicesLoading,
  isReusingVoice,
  mediaStream,
  micBlob,
  micRecording,
  micStatus,
  onClearMediaStream,
  onSelectSample,
  onToggleMicrophone,
  onVoiceDeleted,
  recorderMediaBlob,
  selectedAudioReferenceId,
  selectedLocale,
  selectedProvider,
  status,
  supportedLocales,
  usesInworld,
  usesVoxtral,
  voiceName,
}: {
  dispatch: Dispatch<CloneStateAction>;
  ffmpegError: string | null;
  ffmpegLoading: boolean;
  fileActions: FileUploadResult[1];
  fileState: FileUploadResult[0];
  inworldVoices: AudioReference[];
  inworldVoicesLoading: boolean;
  isReusingVoice: boolean;
  mediaStream: MediaStream | null;
  micBlob: Blob | null;
  micRecording: boolean;
  micStatus: RecorderResult['status'];
  onClearMediaStream: () => void;
  onSelectSample: (sample: SampleAudio) => void;
  onToggleMicrophone: () => Promise<void>;
  onVoiceDeleted: () => void;
  recorderMediaBlob: Blob | null;
  selectedAudioReferenceId: CloneState['selectedAudioReferenceId'];
  selectedLocale: CloneState['selectedLocale'];
  selectedProvider: CloneState['selectedProvider'];
  status: CloneState['status'];
  supportedLocales: { code: string; name: string; value: string }[];
  usesInworld: boolean;
  usesVoxtral: boolean;
  voiceName: string;
}) {
  return (
    <div className="grid w-full gap-6">
      {!isReusingVoice && (
        <CloneAudioInput
          dispatch={dispatch}
          ffmpeg={{
            error: ffmpegError,
            loading: Boolean(ffmpegLoading),
          }}
          fileActions={fileActions}
          fileState={fileState}
          mic={{
            blob: micBlob,
            mediaBlob: recorderMediaBlob,
            mediaStream,
            onClear: onClearMediaStream,
            onToggle: onToggleMicrophone,
            recording: micRecording,
            status: micStatus,
          }}
          onSelectSample={onSelectSample}
          selectedLocale={selectedLocale}
          usesInworld={usesInworld}
          usesVoxtral={usesVoxtral}
        />
      )}

      <div className="grid w-full gap-6">
        <div className="flex w-full gap-2">
          <CloneProviderSelect
            disabled={status === 'generating'}
            dispatch={dispatch}
            selectedProvider={selectedProvider}
          />
          <CloneLanguageSelect
            disabled={status === 'generating'}
            dispatch={dispatch}
            selectedLocale={selectedLocale}
            supportedLocales={supportedLocales}
          />
        </div>
        {usesInworld && (
          <CloneInworldVoiceSelect
            disabled={status === 'generating'}
            loading={inworldVoicesLoading}
            onChange={(value) =>
              dispatch({
                type: 'patch',
                patch: { selectedAudioReferenceId: value },
              })
            }
            onVoiceDeleted={onVoiceDeleted}
            value={selectedAudioReferenceId}
            voices={inworldVoices}
          />
        )}

        {usesInworld && !isReusingVoice && (
          <CloneVoiceNameField
            disabled={status === 'generating'}
            dispatch={dispatch}
            voiceName={voiceName}
          />
        )}
      </div>
    </div>
  );
}

function InworldVoiceSetupActions({
  convertingMicAudio,
  dispatch,
  handleCreateInworldVoice,
  inworldVoiceSetupIsComplete,
  isReusingVoice,
  legalConsentChecked,
  referenceAudioEnhancementEnabled,
  status,
}: {
  convertingMicAudio: boolean;
  dispatch: Dispatch<CloneStateAction>;
  handleCreateInworldVoice: () => Promise<void>;
  inworldVoiceSetupIsComplete: boolean;
  isReusingVoice: boolean;
  legalConsentChecked: boolean;
  referenceAudioEnhancementEnabled: boolean;
  status: CloneState['status'];
}) {
  const t = useTranslations('clone');

  return (
    <>
      <CloneCheckboxes
        disabled={status === 'generating'}
        dispatch={dispatch}
        legalConsentChecked={legalConsentChecked}
        referenceAudioEnhancementEnabled={referenceAudioEnhancementEnabled}
        usesInworld
      />
      <GenerateButton
        className="w-full"
        ctaText={isReusingVoice ? t('goToGenerate') : t('createVoice')}
        data-testid="clone-create-voice-button"
        disabled={
          !inworldVoiceSetupIsComplete ||
          status === 'generating' ||
          convertingMicAudio ||
          !legalConsentChecked
        }
        generatingText={`${t('creatingVoice')}...`}
        isGenerating={status === 'generating' || convertingMicAudio}
        onClick={() => {
          if (isReusingVoice) {
            dispatch({
              type: 'patch',
              patch: { activeTab: 'generate' },
            });
            return;
          }

          handleCreateInworldVoice().catch((error) => {
            console.error('Inworld voice creation failed:', error);
          });
        }}
        showShortcut={false}
      />
    </>
  );
}

function GenerateStepContent({
  canStartGeneration,
  convertingMicAudio,
  dispatch,
  errorMessage,
  handleCancel,
  handleGenerate,
  hasEnoughCredits,
  legalConsentChecked,
  referenceAudioEnhancementEnabled,
  status,
  text,
  textIsOverLimit,
  textMaxLength,
  userHasPaid,
  usesInworld,
  usesVoxtral,
}: {
  canStartGeneration: boolean;
  convertingMicAudio: boolean;
  dispatch: Dispatch<CloneStateAction>;
  errorMessage: string;
  handleCancel: () => void;
  handleGenerate: () => Promise<void>;
  hasEnoughCredits: boolean;
  legalConsentChecked: boolean;
  referenceAudioEnhancementEnabled: boolean;
  status: CloneState['status'];
  text: string;
  textIsOverLimit: boolean;
  textMaxLength: number;
  userHasPaid: boolean;
  usesInworld: boolean;
  usesVoxtral: boolean;
}) {
  const t = useTranslations('clone');

  return (
    <>
      <CloneTextField
        disabled={status === 'generating'}
        dispatch={dispatch}
        text={text}
        textMaxLength={textMaxLength}
        userHasPaid={userHasPaid}
        usesInworld={usesInworld}
        usesVoxtral={usesVoxtral}
      />

      {status === 'error' && errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('errorTitle')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {!hasEnoughCredits && (
        <Alert className="mx-auto w-fit" variant="destructive">
          <AlertDescription>{t('notEnoughCredits')}</AlertDescription>
        </Alert>
      )}

      <CloneCheckboxes
        disabled={status === 'generating'}
        dispatch={dispatch}
        legalConsentChecked={legalConsentChecked}
        referenceAudioEnhancementEnabled={referenceAudioEnhancementEnabled}
        showLegalConsent={!usesInworld}
        usesInworld={usesInworld}
      />

      <GenerateButton
        className="w-full"
        ctaText={t('ctaButton')}
        data-testid="clone-generate-button"
        disabled={
          !canStartGeneration ||
          status === 'generating' ||
          !hasEnoughCredits ||
          convertingMicAudio ||
          textIsOverLimit ||
          !legalConsentChecked
        }
        generatingText={
          status === 'generating'
            ? `${t('generating')}...`
            : `${t('convertingAudio')}...`
        }
        isGenerating={status === 'generating' || convertingMicAudio}
        onClick={handleGenerate}
      />
      {status === 'generating' && (
        <Button className="mx-auto" onClick={handleCancel} variant="outline">
          {t('cancelButton')} <CircleStop className="size-4" name="cancel" />
        </Button>
      )}
    </>
  );
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

export default function NewVoiceClient({
  lang,
  hasEnoughCredits,
  userHasPaid,
}: {
  lang: Locale;
  hasEnoughCredits: boolean;
  userHasPaid: boolean;
}) {
  return (
    <AudioProvider>
      <NewVoiceClientInner
        hasEnoughCredits={hasEnoughCredits}
        lang={lang}
        userHasPaid={userHasPaid}
      />
    </AudioProvider>
  );
}

function NewVoiceClientInner({
  lang,
  hasEnoughCredits,
  userHasPaid,
}: {
  lang: Locale;
  hasEnoughCredits: boolean;
  userHasPaid: boolean;
}) {
  const t = useTranslations('clone');
  const {
    convert: convertWithFFmpeg,
    ensureLoaded,
    isLoading: ffmpegLoading,
  } = useFFmpeg({ lazyLoad: true });
  const [cloneState, dispatch] = useReducer(
    cloneStateReducer,
    initialCloneState,
  );
  const {
    activeTab,
    convertingMicAudio,
    errorMessage,
    ffmpegError,
    generatedAudioUrl,
    inworldVoices,
    inworldVoicesLoading,
    legalConsentChecked,
    micBlob,
    micRecording,
    referenceAudioEnhancementEnabled,
    selectedAudioReferenceId,
    selectedLocale,
    selectedProvider,
    status,
    text,
    voiceName,
  } = cloneState;

  const usesInworld = selectedProvider === 'inworld';
  // Reusing a saved voice skips the audio upload and re-cloning entirely.
  const isReusingVoice = usesInworld && selectedAudioReferenceId !== 'new';
  const usesVoxtral = VOXTRAL_SUPPORTED_LOCALE_CODES.has(selectedLocale.code);
  // Inworld also needs WAV reference audio, so preload FFmpeg for it too
  // (only relevant when creating a new voice from a fresh upload).
  const needsWavPreload = usesVoxtral || (usesInworld && !isReusingVoice);

  // Load the user's saved Inworld voices when the Inworld engine is selected.
  const loadInworldVoices = useCallback(async () => {
    dispatch({ type: 'patch', patch: { inworldVoicesLoading: true } });
    try {
      const res = await fetch('/api/audio-references?provider=inworld');
      if (!res.ok) {
        throw new Error('Failed to load voices');
      }
      const json = (await res.json()) as {
        data: {
          id: string;
          provider: string;
          voice_id: string;
          name: string;
          is_paid: boolean;
          created_at: string | null;
        }[];
      };
      dispatch({
        type: 'patch',
        patch: {
          inworldVoices: (json.data ?? []).map((row) => ({
            id: row.id,
            provider: row.provider,
            voiceId: row.voice_id,
            name: row.name,
            isPaid: row.is_paid,
            createdAt: row.created_at,
          })),
        },
      });
    } catch (error) {
      console.error('Failed to load Inworld voices:', error);
      toast.error(t('errors.failedToLoadVoices'));
    } finally {
      dispatch({ type: 'patch', patch: { inworldVoicesLoading: false } });
    }
  }, [t]);

  useEffect(() => {
    if (usesInworld) {
      loadInworldVoices().catch(() => undefined);
    }
  }, [usesInworld, loadInworldVoices]);

  const onVoiceDeleted = useCallback(() => {
    dispatch({ type: 'patch', patch: { selectedAudioReferenceId: 'new' } });
    loadInworldVoices().catch(() => undefined);
  }, [loadInworldVoices]);

  // Preload FFmpeg when a provider that needs WAV reference audio is selected
  useEffect(() => {
    if (needsWavPreload) {
      dispatch({ type: 'patch', patch: { ffmpegError: null } });
      ensureLoaded().catch((error) => {
        const errorMsg =
          error instanceof Error
            ? error.message
            : t('failedToLoadAudioProcessor');
        dispatch({ type: 'patch', patch: { ffmpegError: errorMsg } });
        console.error('FFmpeg preload error:', error);
      });
    }
  }, [needsWavPreload, ensureLoaded, t]);

  const handleStartRecording = async () => {
    try {
      dispatch({ type: 'patch', patch: { ffmpegError: null } });
      // Preload FFmpeg before recording if needed for this locale/provider
      if (needsWavPreload) {
        await ensureLoaded();
      }
      await startRecording();
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : t('failedToLoadAudioProcessor');
      dispatch({
        type: 'patch',
        patch: {
          ffmpegError: errorMsg,
          errorMessage: formatCloneMessage(t('failedToStartRecording'), {
            ERROR: errorMsg,
          }),
        },
      });
    }
  };

  const {
    status: micStatus,
    startRecording,
    stopRecording,
    clearMediaStream,
    clearMediaBlob,
    mediaStream,
    mediaBlob: recorderMediaBlob,
    getMediaStream,
  } = useMediaRecorder({
    mediaStreamConstraints: { audio: true },
    onStop: (blob) => {
      // Store the raw blob - conversion will happen at generation time based on the locale
      dispatch({ type: 'patch', patch: { micBlob: blob } });
    },
    onError: (err) => {
      console.error(err);
      dispatch({
        type: 'patch',
        patch: {
          ffmpegError:
            err instanceof Error ? err.message : t('microphoneError'),
        },
      });
    },
    onStart: () => {
      dispatch({
        type: 'patch',
        patch: {
          micRecording: true,
          micBlob: null,
          ffmpegError: null,
        },
      });
    },
  });

  const supportedLocaleOptions = usesInworld
    ? CLONE_SUPPORTED_LOCALES.filter(({ code }) =>
        INWORLD_SUPPORTED_LOCALE_CODES.has(code),
      )
    : CLONE_SUPPORTED_LOCALES;
  const supportedLocales = (() => {
    const codes = supportedLocaleOptions.map(({ code }) => code);
    const translated = getTranslatedLanguages(lang, codes);
    const merged = translated.map(({ value: code, label }) => ({
      code,
      value:
        supportedLocaleOptions.find((locale) => locale.code === code)?.value ||
        code,
      name: label,
    }));
    const current = merged.find((l) => l.code === lang);
    const rest = merged.filter((l) => l.code !== lang);
    return current ? [current, ...rest] : merged;
  })();

  useEffect(() => {
    if (
      supportedLocales.some((locale) => locale.code === selectedLocale.code)
    ) {
      return;
    }

    const fallbackLocale =
      supportedLocales.find((locale) => locale.code === 'en') ??
      supportedLocales[0];
    if (!fallbackLocale) {
      return;
    }

    dispatch({
      type: 'patch',
      patch: {
        selectedLocale: {
          code: fallbackLocale.code,
          value: fallbackLocale.value,
        },
      },
    });
  }, [selectedLocale.code, supportedLocales]);

  const onFilesAdded = useCallback(() => {
    dispatch({
      type: 'patch',
      patch: {
        status: 'idle',
        errorMessage: '',
      },
    });
  }, []);

  const textMaxLength = getCloneTextMaxLength(
    selectedLocale.code,
    userHasPaid,
    usesInworld ? 'inworld' : null,
  );

  const [fileState, fileActions] = useFileUpload({
    onFilesAdded,
    maxSize: CLONING_FILE_MAX_SIZE,
    accept: ALLOWED_TYPES,
    multiple: false,
  });
  const { files, errors } = fileState;
  const { clearErrors } = fileActions;

  const file = files[0]?.file instanceof File ? files[0].file : null;

  // Clear custom error message when file upload errors change
  useEffect(() => {
    if (errors.length > 0) {
      dispatch({ type: 'patch', patch: { errorMessage: '' } });
    }
  }, [errors]);

  const abortController = useRef<AbortController | null>(null);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Existing generation flow handles file, microphone, conversion, API, and error states together.
  const handleGenerate = async () => {
    if (!(isReusingVoice || file || micBlob)) {
      dispatch({
        type: 'patch',
        patch: {
          errorMessage: t('errors.noAudioFile'),
          status: 'error',
        },
      });
      return;
    }

    if (!text.trim()) {
      dispatch({
        type: 'patch',
        patch: {
          errorMessage: t('errors.noText'),
          status: 'error',
        },
      });
      return;
    }

    if (usesInworld && !isReusingVoice) {
      dispatch({
        type: 'patch',
        patch: {
          errorMessage: t('errors.inworldVoiceRequired'),
          status: 'error',
        },
      });
      return;
    }

    // Clear both custom errors and file upload errors
    clearErrors();
    dispatch({
      type: 'patch',
      patch: {
        errorMessage: '',
        status: 'generating',
      },
    });

    let voiceRes: Response | undefined;
    try {
      abortController.current = new AbortController();

      const formData = new FormData();
      formData.append(CLONE_FORM_FIELDS.text, text);
      formData.append(CLONE_FORM_FIELDS.locale, selectedLocale.code);
      if (selectedProvider !== 'auto') {
        formData.append(CLONE_FORM_FIELDS.provider, selectedProvider);
      }

      if (isReusingVoice) {
        // Reuse a saved Inworld voice — no audio upload, no re-cloning.
        formData.append(
          CLONE_FORM_FIELDS.audioReferenceId,
          selectedAudioReferenceId,
        );
      } else {
        let audioToProcess = file;
        if (micBlob && !file) {
          const shouldConvertMicAudio = isWebmAudioBlob(micBlob);

          if (shouldConvertMicAudio) {
            dispatch({
              type: 'patch',
              patch: { convertingMicAudio: true },
            });
          }

          try {
            if (shouldConvertMicAudio) {
              await ensureLoaded();
            }

            audioToProcess = await createMicrophoneReferenceAudioFile(
              micBlob,
              convertWithFFmpeg,
            );
          } catch (convertError) {
            console.error('WebM to WAV conversion error:', convertError);
            // TODO send logs to Sentry
            dispatch({
              type: 'patch',
              patch: {
                errorMessage:
                  convertError instanceof Error
                    ? formatCloneMessage(
                        t('audioConversionFailedWithMessage'),
                        {
                          ERROR: convertError.message,
                        },
                      )
                    : t('audioConversionFailed'),
                status: 'error',
              },
            });
            return;
          } finally {
            if (shouldConvertMicAudio) {
              dispatch({
                type: 'patch',
                patch: { convertingMicAudio: false },
              });
            }
          }
        }

        if (!audioToProcess) {
          dispatch({
            type: 'patch',
            patch: {
              errorMessage: t('errors.noAudioFile'),
              status: 'error',
            },
          });
          return;
        }

        formData.append(CLONE_FORM_FIELDS.file, audioToProcess);
        formData.append(
          CLONE_FORM_FIELDS.enhanceReferenceAudio,
          String(referenceAudioEnhancementEnabled),
        );
      }

      voiceRes = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData,
        signal: abortController.current.signal,
      });

      if (!voiceRes.ok) {
        let errorMessage = t('errorCloning');
        let voiceResult: CloneErrorResponse | null = null;

        try {
          voiceResult = (await voiceRes.json()) as CloneErrorResponse;
        } catch {
          voiceResult = null;
        }

        // Older/proxy 413 responses may still arrive without the JSON error contract.
        if (voiceRes.status === 413 && !voiceResult?.code) {
          errorMessage = t('errorTooLarge');
        } else {
          errorMessage = getCloneErrorMessage(
            t,
            voiceResult?.code,
            voiceResult?.message ||
              voiceResult?.serverMessage ||
              voiceResult?.error ||
              errorMessage,
            voiceResult?.details,
          );
        }

        dispatch({
          type: 'patch',
          patch: {
            errorMessage,
            status: 'error',
          },
        });
        return;
      }

      const voiceResult = (await voiceRes.json()) as CloneSuccessResponse;

      toast.success(t('success'));

      dispatch({
        type: 'patch',
        patch: {
          activeTab: 'preview',
          generatedAudioUrl: voiceResult.url,
          status: 'complete',
        },
      });

      // A new Inworld voice was just saved — refresh the reusable-voice list.
      if (usesInworld && !isReusingVoice) {
        loadInworldVoices().catch(() => undefined);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === 'signal is aborted without reason'
      ) {
        return;
      }
      let errorMsg = '';
      if (voiceRes && !voiceRes.ok) {
        errorMsg = voiceRes.statusText;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      dispatch({
        type: 'patch',
        patch: {
          errorMessage: errorMsg || t('unexpectedError'),
          status: 'error',
        },
      });
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Inworld voice creation handles validation, microphone conversion, upload, API errors, and state transitions together.
  const handleCreateInworldVoice = async () => {
    if (!(file || micBlob)) {
      dispatch({
        type: 'patch',
        patch: {
          errorMessage: t('errors.noAudioFile'),
          status: 'error',
        },
      });
      return;
    }

    if (!voiceName.trim()) {
      dispatch({
        type: 'patch',
        patch: {
          errorMessage: t('errors.voiceNameRequired'),
          status: 'error',
        },
      });
      return;
    }

    clearErrors();
    dispatch({
      type: 'patch',
      patch: {
        errorMessage: '',
        status: 'generating',
      },
    });

    let voiceRes: Response | undefined;
    try {
      abortController.current = new AbortController();

      let audioToProcess = file;
      if (micBlob && !file) {
        const shouldConvertMicAudio = isWebmAudioBlob(micBlob);

        if (shouldConvertMicAudio) {
          dispatch({
            type: 'patch',
            patch: { convertingMicAudio: true },
          });
        }

        try {
          if (shouldConvertMicAudio) {
            await ensureLoaded();
          }

          audioToProcess = await createMicrophoneReferenceAudioFile(
            micBlob,
            convertWithFFmpeg,
          );
        } catch (convertError) {
          console.error('WebM to WAV conversion error:', convertError);
          dispatch({
            type: 'patch',
            patch: {
              errorMessage:
                convertError instanceof Error
                  ? formatCloneMessage(t('audioConversionFailedWithMessage'), {
                      ERROR: convertError.message,
                    })
                  : t('audioConversionFailed'),
              status: 'error',
            },
          });
          return;
        } finally {
          if (shouldConvertMicAudio) {
            dispatch({
              type: 'patch',
              patch: { convertingMicAudio: false },
            });
          }
        }
      }

      if (!audioToProcess) {
        dispatch({
          type: 'patch',
          patch: {
            errorMessage: t('errors.noAudioFile'),
            status: 'error',
          },
        });
        return;
      }

      const formData = new FormData();
      formData.append('file', audioToProcess);
      formData.append('locale', selectedLocale.code);
      formData.append('name', voiceName);

      voiceRes = await fetch('/api/audio-references', {
        method: 'POST',
        body: formData,
        signal: abortController.current.signal,
      });

      if (!voiceRes.ok) {
        let errorMessage = t('errorCloning');
        let voiceResult: { error?: string } | null = null;

        try {
          voiceResult = (await voiceRes.json()) as { error?: string };
        } catch {
          voiceResult = null;
        }

        errorMessage = voiceResult?.error || errorMessage;

        dispatch({
          type: 'patch',
          patch: {
            errorMessage,
            status: 'error',
          },
        });
        return;
      }

      const voiceResult = (await voiceRes.json()) as {
        data: AudioReference;
      };

      toast.success(t('voiceCreated'));
      dispatch({
        type: 'patch',
        patch: {
          activeTab: 'generate',
          errorMessage: '',
          selectedAudioReferenceId: voiceResult.data.id,
          status: 'idle',
        },
      });
      loadInworldVoices().catch(() => undefined);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === 'signal is aborted without reason'
      ) {
        return;
      }
      let errorMsg = '';
      if (voiceRes && !voiceRes.ok) {
        errorMsg = voiceRes.statusText;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      dispatch({
        type: 'patch',
        patch: {
          errorMessage: errorMsg || t('unexpectedError'),
          status: 'error',
        },
      });
    }
  };

  const handleCancel = useCallback(() => {
    abortController.current?.abort();
    dispatch({ type: 'patch', patch: { status: 'idle' } });
  }, []);

  const textIsOverLimit = text.length > textMaxLength;
  const hasVoiceSource = Boolean(isReusingVoice || file || micBlob);
  const inworldVoiceSetupIsComplete = Boolean(
    isReusingVoice || ((file || micBlob) && voiceName.trim()),
  );
  const canStartGeneration = Boolean(
    text.trim() && (usesInworld ? isReusingVoice : hasVoiceSource),
  );

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();

      if (
        canStartGeneration &&
        status !== 'generating' &&
        hasEnoughCredits &&
        legalConsentChecked &&
        !textIsOverLimit
      ) {
        handleGenerate().catch((error) => {
          console.error('Keyboard shortcut clone generation failed:', error);
        });
      }
    }
  });

  // Keyboard shortcut handler. onKeyDown is a useEffectEvent, so it already has
  // a stable identity and can be attached directly.
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const downloadAudio = async () => {
    if (!generatedAudioUrl) return;

    try {
      await downloadUrl(generatedAudioUrl, document.createElement('a'));
    } catch {
      toast.error(t('errorCloning'));
    }
  };

  const onSelectSample = (sample: SampleAudio) => {
    dispatch({
      type: 'patch',
      patch: {
        selectedLocale: { code: 'en', value: 'english' },
        text: sample.prompt,
      },
    });
  };

  const onToggleMicrophone = async () => {
    if (micStatus === 'idle' || micStatus === 'stopped') {
      clearMediaStream();
      // Request microphone access on first toggle
      await getMediaStream();
      await handleStartRecording();
    } else if (micStatus === 'recording') {
      stopRecording();
    }
  };

  const onClearMediaStream = () => {
    clearMediaStream();
    clearMediaBlob();
    dispatch({
      type: 'patch',
      patch: {
        ffmpegError: null,
        micBlob: null,
        micRecording: false,
      },
    });
  };

  useEffect(() => {
    if (!usesInworld && activeTab === 'generate') {
      dispatch({ type: 'patch', patch: { activeTab: 'upload' } });
    }
  }, [activeTab, usesInworld]);

  const onTabValueChange = (nextTab: string) => {
    let nextActiveTab: typeof activeTab = 'upload';

    if (nextTab === 'preview') {
      nextActiveTab = 'preview';
    } else if (usesInworld && nextTab === 'generate') {
      nextActiveTab = 'generate';
    }

    dispatch({
      type: 'patch',
      patch: {
        activeTab: nextActiveTab,
      },
    });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs
          className="w-full"
          onValueChange={onTabValueChange}
          value={activeTab}
        >
          <TabsList
            className={`grid w-full ${usesInworld ? 'grid-cols-3' : 'grid-cols-2'}`}
          >
            <TabsTrigger value="upload">
              {usesInworld ? t('tabUploadSelectVoice') : t('tabUpload')}
            </TabsTrigger>
            {usesInworld && (
              <TabsTrigger
                disabled={!(isReusingVoice && legalConsentChecked)}
                value="generate"
              >
                {t('tabGenerate')}
              </TabsTrigger>
            )}
            <TabsTrigger disabled={status !== 'complete'} value="preview">
              {t('tabPreview')}
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6 py-4" value="upload">
            <VoiceSetupStepContent
              dispatch={dispatch}
              ffmpegError={ffmpegError}
              ffmpegLoading={Boolean(ffmpegLoading)}
              fileActions={fileActions}
              fileState={fileState}
              inworldVoices={inworldVoices}
              inworldVoicesLoading={inworldVoicesLoading}
              isReusingVoice={isReusingVoice}
              mediaStream={mediaStream}
              micBlob={micBlob}
              micRecording={micRecording}
              micStatus={micStatus}
              onClearMediaStream={onClearMediaStream}
              onSelectSample={onSelectSample}
              onToggleMicrophone={onToggleMicrophone}
              onVoiceDeleted={onVoiceDeleted}
              recorderMediaBlob={recorderMediaBlob}
              selectedAudioReferenceId={selectedAudioReferenceId}
              selectedLocale={selectedLocale}
              selectedProvider={selectedProvider}
              status={status}
              supportedLocales={supportedLocales}
              usesInworld={usesInworld}
              usesVoxtral={usesVoxtral}
              voiceName={voiceName}
            />
            {usesInworld && (
              <InworldVoiceSetupActions
                convertingMicAudio={convertingMicAudio}
                dispatch={dispatch}
                handleCreateInworldVoice={handleCreateInworldVoice}
                inworldVoiceSetupIsComplete={inworldVoiceSetupIsComplete}
                isReusingVoice={isReusingVoice}
                legalConsentChecked={legalConsentChecked}
                referenceAudioEnhancementEnabled={
                  referenceAudioEnhancementEnabled
                }
                status={status}
              />
            )}
            {!usesInworld && (
              <GenerateStepContent
                canStartGeneration={canStartGeneration}
                convertingMicAudio={convertingMicAudio}
                dispatch={dispatch}
                errorMessage={errorMessage}
                handleCancel={handleCancel}
                handleGenerate={handleGenerate}
                hasEnoughCredits={hasEnoughCredits}
                legalConsentChecked={legalConsentChecked}
                referenceAudioEnhancementEnabled={
                  referenceAudioEnhancementEnabled
                }
                status={status}
                text={text}
                textIsOverLimit={textIsOverLimit}
                textMaxLength={textMaxLength}
                userHasPaid={userHasPaid}
                usesInworld={false}
                usesVoxtral={usesVoxtral}
              />
            )}
          </TabsContent>

          {usesInworld && (
            <TabsContent className="space-y-6 py-4" value="generate">
              <GenerateStepContent
                canStartGeneration={canStartGeneration}
                convertingMicAudio={convertingMicAudio}
                dispatch={dispatch}
                errorMessage={errorMessage}
                handleCancel={handleCancel}
                handleGenerate={handleGenerate}
                hasEnoughCredits={hasEnoughCredits}
                legalConsentChecked={legalConsentChecked}
                referenceAudioEnhancementEnabled={
                  referenceAudioEnhancementEnabled
                }
                status={status}
                text={text}
                textIsOverLimit={textIsOverLimit}
                textMaxLength={textMaxLength}
                userHasPaid={userHasPaid}
                usesInworld={usesInworld}
                usesVoxtral={usesVoxtral}
              />
            </TabsContent>
          )}

          <TabsContent className="space-y-4 py-4" value="preview">
            <PreviewTabContent
              downloadAudio={downloadAudio}
              generatedAudioUrl={generatedAudioUrl}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
