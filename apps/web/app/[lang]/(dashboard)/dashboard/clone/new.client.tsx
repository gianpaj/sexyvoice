'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CircleStop, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { AudioPlayerWithContext } from '@/components/audio-player-with-context';
import { AudioProvider } from '@/components/audio-provider';
import { SavedCallVoices } from '@/components/call/voice-picker';
import { GenerateButton } from '@/components/generate-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UpgradeCrown } from '@/components/upgrade-crown';
import { type CloneDemoTakeId, getDemoCloneSelection } from '@/data/demo-clone';
import { useFFmpeg } from '@/hooks/use-ffmpeg';
import { useFileUpload } from '@/hooks/use-file-upload';
import useMediaRecorder from '@/hooks/use-media-recorder';
import { SamplePlayerProvider } from '@/hooks/use-sample-player';
import type { SavedCallVoice } from '@/lib/call-voices';
import {
  CLONE_FORM_FIELDS,
  type CloneSuccessResponse,
  type SaveVoiceSuccessResponse,
} from '@/lib/clone/api-types';
import {
  type CallCloneProvider,
  MAX_SAVED_CALL_VOICES,
  savedVoiceProvider,
  supportsCallCloneLocale,
} from '@/lib/clone/call-voice-config';
import {
  CLONE_SUPPORTED_LOCALE_CODES,
  resolveBaseCloneLocale,
} from '@/lib/clone/constants';
import { loadDemoCloneReference } from '@/lib/clone/demo-reference';
import { readCloneError } from '@/lib/clone/error-message';
import {
  createMicrophoneReferenceAudioFile,
  isWebmAudioBlob,
} from '@/lib/clone/microphone-reference-audio';
import {
  CLONE_PROVIDERS,
  cloneTextLimit,
  oneOffCloneProvider,
} from '@/lib/clone/providers';
import {
  REFERENCE_AUDIO_ACCEPT,
  REFERENCE_AUDIO_MAX_BYTES,
  VOICE_NAME_MAX_LENGTH,
} from '@/lib/clone/reference-audio';
import { invalidateCredits } from '@/lib/credits-query';
import { downloadUrl } from '@/lib/download';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';
import { sortByPageLocale } from '@/lib/i18n/sort-by-page-locale';
import { cn } from '@/lib/utils';
import { CloneAudioInput } from './clone-audio-input';
import {
  CloneConsentFields,
  type ReferenceCleanup,
} from './clone-consent-fields';
import { CloneLanguageSelect } from './clone-language-select';
import { cloneStateReducer, initialCloneState } from './clone-state';
import { CloneTextField } from './clone-text-field';
import { DeleteSavedVoiceDialog } from './delete-saved-voice-dialog';

export type { Status } from './clone-state';

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

// ─── Public wrapper ───────────────────────────────────────────────────────────

interface InitialDemo {
  speakerId: string;
  takeId: CloneDemoTakeId;
}

export default function NewVoiceClient({
  savedVoices = [],
  voiceUsers = {},
  callCloneProvider = 'inworld',
  lang,
  hasEnoughCredits,
  userHasPaid,
  initialDemo,
  initialSaveForCalls = false,
}: {
  savedVoices?: SavedCallVoice[];
  /** Names of the characters that use each saved voice, by voice ID. */
  voiceUsers?: Record<string, string[]>;
  callCloneProvider?: CallCloneProvider;
  lang: Locale;
  hasEnoughCredits: boolean;
  userHasPaid: boolean;
  initialDemo?: InitialDemo;
  initialSaveForCalls?: boolean;
}) {
  return (
    <AudioProvider>
      <SamplePlayerProvider>
        <NewVoiceClientInner
          callCloneProvider={callCloneProvider}
          hasEnoughCredits={hasEnoughCredits}
          initialDemo={initialDemo}
          initialSaveForCalls={initialSaveForCalls}
          lang={lang}
          savedVoices={savedVoices}
          userHasPaid={userHasPaid}
          voiceUsers={voiceUsers}
        />
      </SamplePlayerProvider>
    </AudioProvider>
  );
}

function NewVoiceClientInner({
  savedVoices: initialSavedVoices,
  voiceUsers,
  callCloneProvider,
  lang,
  hasEnoughCredits,
  userHasPaid,
  initialDemo,
  initialSaveForCalls = false,
}: {
  savedVoices: SavedCallVoice[];
  voiceUsers: Record<string, string[]>;
  callCloneProvider: CallCloneProvider;
  lang: Locale;
  hasEnoughCredits: boolean;
  userHasPaid: boolean;
  initialDemo?: InitialDemo;
  initialSaveForCalls?: boolean;
}) {
  const t = useTranslations('clone');
  const [savedVoices, setSavedVoices] = useState(initialSavedVoices);
  const [saveVoiceOnly, setSaveVoiceOnly] = useState(
    initialSaveForCalls &&
      userHasPaid &&
      initialSavedVoices.length < MAX_SAVED_CALL_VOICES,
  );
  const [voiceName, setVoiceName] = useState('');
  const [savedVoiceId, setSavedVoiceId] = useState<string | null>(null);
  // A saved voice replaces the reference audio for generation.
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [voiceToDelete, setVoiceToDelete] = useState<SavedCallVoice | null>(
    null,
  );
  const selectedVoice =
    savedVoices.find((voice) => voice.id === selectedVoiceId) ?? null;
  // Inworld voices speak any call language; Mistral voices keep theirs.
  const voiceKeepsLocale = selectedVoice?.provider === 'mistral';
  const atVoiceLimit = savedVoices.length >= MAX_SAVED_CALL_VOICES;
  const translateErrorCode = useTranslations('errorCodes');
  const demoLabels = useTranslations('landing.demoClone');
  const {
    convert: convertWithFFmpeg,
    ensureLoaded,
    isLoading: ffmpegLoading,
  } = useFFmpeg({ lazyLoad: true });
  const [cloneState, dispatch] = useReducer(
    cloneStateReducer,
    initialDemo,
    (demo) => {
      const selection = getDemoCloneSelection(
        demo?.speakerId ?? null,
        demo?.takeId ?? null,
      );
      return selection
        ? {
            ...initialCloneState,
            selectedLocaleCode: selection.speaker.languageCode,
            text: selection.take.prompt,
          }
        : initialCloneState;
    },
  );
  const {
    activeTab,
    convertingMicAudio,
    errorMessage,
    ffmpegError,
    generatedAudioUrl,
    legalConsentChecked,
    micBlob,
    micRecording,
    referenceAudioEnhancementEnabled,
    selectedLocaleCode,
    status,
    text,
  } = cloneState;

  const oneOffProvider = oneOffCloneProvider(selectedLocaleCode);
  const usesVoxtral = oneOffProvider === 'mistral';
  // Saving for calls clones with the call provider.
  const referenceProvider = saveVoiceOnly ? callCloneProvider : oneOffProvider;
  const canSaveVoice = supportsCallCloneLocale(
    callCloneProvider,
    selectedLocaleCode,
  );

  // Preload FFmpeg when Voxtral locale is selected
  useEffect(() => {
    if (usesVoxtral) {
      dispatch({ patch: { ffmpegError: null }, type: 'patch' });
      ensureLoaded().catch((error) => {
        const errorMsg =
          error instanceof Error
            ? error.message
            : t('failedToLoadAudioProcessor');
        dispatch({ patch: { ffmpegError: errorMsg }, type: 'patch' });
        console.error('FFmpeg preload error:', error);
      });
    }
  }, [usesVoxtral, ensureLoaded, t]);

  // MediaRecorder WebM blobs often report no duration, so time the take.
  // The input picked in the microphone menu; unset records from the default.
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const recordingStartedAt = useRef(0);
  const [micSeconds, setMicSeconds] = useState<number | null>(null);

  const handleStartRecording = async () => {
    try {
      dispatch({ patch: { ffmpegError: null }, type: 'patch' });
      // Preload FFmpeg before recording if needed for this locale
      if (usesVoxtral) {
        await ensureLoaded();
      }
      await startRecording();
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : t('failedToLoadAudioProcessor');
      dispatch({
        patch: {
          errorMessage: t('failedToStartRecording', { ERROR: errorMsg }),
          ffmpegError: errorMsg,
        },
        type: 'patch',
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
    mediaStreamConstraints: {
      audio: micDeviceId ? { deviceId: { ideal: micDeviceId } } : true,
    },
    onError: (err) => {
      console.error(err);
      dispatch({
        patch: { ffmpegError: t('microphoneError') },
        type: 'patch',
      });
    },
    onStart: () => {
      recordingStartedAt.current = Date.now();
      setMicSeconds(null);
      dispatch({
        patch: {
          ffmpegError: null,
          micBlob: null,
          micRecording: true,
        },
        type: 'patch',
      });
    },
    onStop: (blob) => {
      setMicSeconds((Date.now() - recordingStartedAt.current) / 1000);
      // Store the raw blob - conversion will happen at generation time based on the locale
      dispatch({ patch: { micBlob: blob }, type: 'patch' });
    },
  });

  const supportedLocales = (() => {
    const translated = getTranslatedLanguages(lang, [
      ...CLONE_SUPPORTED_LOCALE_CODES,
    ]);
    const locales = translated.map(({ value: code, label }) => ({
      code,
      name: code === 'en-multi' ? t('englishChatterbox') : label,
    }));
    return sortByPageLocale(locales, lang);
  })();
  const selectedLocaleName =
    supportedLocales.find(
      ({ code }) => code === resolveBaseCloneLocale(selectedLocaleCode),
    )?.name ?? selectedLocaleCode;

  // Saved voices belong to paid users, so they get the paid limit.
  const textMaxLength = selectedVoice
    ? cloneTextLimit(savedVoiceProvider(selectedVoice.provider), true)
    : cloneTextLimit(oneOffProvider, userHasPaid);

  const upload = useFileUpload({
    accept: REFERENCE_AUDIO_ACCEPT,
    maxSize: REFERENCE_AUDIO_MAX_BYTES,
    // A new pick replaces the previous error.
    onFileChosen: (accepted) =>
      dispatch({
        patch: accepted
          ? { errorMessage: '', status: 'idle' }
          : { errorMessage: '' },
        type: 'patch',
      }),
  });
  const { file } = upload;

  const applyInitialReference = useEffectEvent((reference: File) => {
    if (!(file || micBlob || micRecording)) upload.addFile(reference);
  });
  const reportInitialReferenceError = useEffectEvent(() => {
    dispatch({
      patch: { errorMessage: demoLabels('audioError'), status: 'error' },
      type: 'patch',
    });
  });
  useEffect(() => {
    const selection = getDemoCloneSelection(
      initialDemo?.speakerId ?? null,
      initialDemo?.takeId ?? null,
    );
    if (!selection) return;
    const controller = new AbortController();
    loadDemoCloneReference(selection.speaker, controller.signal)
      .then((reference) => {
        if (!controller.signal.aborted) applyInitialReference(reference);
      })
      .catch(() => {
        if (!controller.signal.aborted) reportInitialReferenceError();
      });
    return () => controller.abort();
  }, [initialDemo?.speakerId, initialDemo?.takeId]);

  const abortController = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const handleGenerate = async () => {
    if (!(selectedVoice || file || micBlob)) {
      dispatch({
        patch: {
          errorMessage: t('errors.noAudioFile'),
          status: 'error',
        },
        type: 'patch',
      });
      return;
    }

    if (
      !(selectedVoice || legalConsentChecked) ||
      (saveVoiceOnly && !(voiceName.trim() && canSaveVoice && userHasPaid))
    )
      return;

    if (!(saveVoiceOnly || text.trim())) {
      dispatch({
        patch: {
          errorMessage: t('errors.noText'),
          status: 'error',
        },
        type: 'patch',
      });
      return;
    }

    // Clear both custom errors and file upload errors
    upload.clearError();
    dispatch({
      patch: {
        errorMessage: '',
        status: 'generating',
      },
      type: 'patch',
    });

    let voiceRes: Response | undefined;
    const controller = new AbortController();
    abortController.current = controller;
    try {
      let formData: FormData;
      if (selectedVoice) {
        formData = new FormData();
        formData.append(CLONE_FORM_FIELDS.text, text);
        formData.append(
          CLONE_FORM_FIELDS.locale,
          voiceKeepsLocale
            ? (selectedVoice.locale ?? selectedLocaleCode)
            : selectedLocaleCode,
        );
        formData.append(CLONE_FORM_FIELDS.savedVoiceId, selectedVoice.id);
      } else {
        let audioToProcess = file;
        if (micBlob && !file) {
          const shouldConvertMicAudio = isWebmAudioBlob(micBlob);

          if (shouldConvertMicAudio) {
            dispatch({
              patch: { convertingMicAudio: true },
              type: 'patch',
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
              patch: {
                errorMessage:
                  convertError instanceof Error
                    ? t('audioConversionFailedWithMessage', {
                        ERROR: convertError.message,
                      })
                    : t('audioConversionFailed'),
                status: 'error',
              },
              type: 'patch',
            });
            return;
          } finally {
            if (shouldConvertMicAudio) {
              dispatch({
                patch: { convertingMicAudio: false },
                type: 'patch',
              });
            }
          }
        }

        if (!audioToProcess) {
          dispatch({
            patch: {
              errorMessage: t('errors.noAudioFile'),
              status: 'error',
            },
            type: 'patch',
          });
          return;
        }

        // First upload and process the voice
        formData = new FormData();
        formData.append(CLONE_FORM_FIELDS.file, audioToProcess);
        formData.append(CLONE_FORM_FIELDS.text, text);
        formData.append(CLONE_FORM_FIELDS.locale, selectedLocaleCode);
        formData.append(
          CLONE_FORM_FIELDS.enhanceReferenceAudio,
          String(referenceAudioEnhancementEnabled),
        );

        if (saveVoiceOnly) {
          formData.append(CLONE_FORM_FIELDS.saveVoiceName, voiceName.trim());
          formData.append(
            CLONE_FORM_FIELDS.voiceConsent,
            String(legalConsentChecked),
          );
        }
      }
      voiceRes = await fetch('/api/clone-voice', {
        body: formData,
        method: 'POST',
        signal: controller.signal,
      });

      // The route settles its reservation and any refund before it responds, so
      // every response carries a settled balance. An aborted or failed fetch
      // cannot confirm settlement. See ARCHITECTURE.md#credit-balance-sync.
      invalidateCredits(queryClient).catch(() => undefined);

      if (!voiceRes.ok) {
        const errorMessage = await readCloneError(
          voiceRes,
          t,
          translateErrorCode,
        );

        dispatch({
          patch: {
            errorMessage,
            status: 'error',
          },
          type: 'patch',
        });
        return;
      }

      const voiceResult = (await voiceRes.json()) as
        | CloneSuccessResponse
        | SaveVoiceSuccessResponse;
      if ('voice' in voiceResult) {
        const savedVoice = voiceResult.voice;
        setSavedVoiceId(savedVoice.id);
        setSavedVoices((voices) => [
          savedVoice,
          ...voices.filter((voice) => voice.id !== savedVoice.id),
        ]);
        dispatch({ patch: { status: 'idle' }, type: 'patch' });
        toast.success(t('savedVoice.success'));
        return;
      }

      toast.success(t('success'));

      dispatch({
        patch: {
          activeTab: 'preview',
          generatedAudioUrl: voiceResult.url,
          status: 'complete',
        },
        type: 'patch',
      });
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      let errorMsg = '';
      if (voiceRes && !voiceRes.ok) {
        errorMsg = voiceRes.statusText;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      dispatch({
        patch: {
          errorMessage: errorMsg || t('unexpectedError'),
          status: 'error',
        },
        type: 'patch',
      });
    }
  };

  const handleCancel = useCallback(() => {
    abortController.current?.abort();
    dispatch({ patch: { status: 'idle' }, type: 'patch' });
  }, []);

  const downloadAudio = async () => {
    if (!generatedAudioUrl) return;

    try {
      await downloadUrl(generatedAudioUrl, document.createElement('a'));
    } catch {
      toast.error(t('errorCloning'));
    }
  };

  const onToggleMicrophone = async () => {
    // A failed start (blocked microphone) can be retried once access is allowed.
    if (
      micStatus === 'idle' ||
      micStatus === 'stopped' ||
      micStatus === 'failed'
    ) {
      clearMediaStream();
      // Request microphone access on first toggle
      await getMediaStream();
      await handleStartRecording();
    } else if (micStatus === 'recording') {
      stopRecording();
    }
  };

  const onClearMediaStream = () => {
    setMicSeconds(null);
    clearMediaStream();
    clearMediaBlob();
    dispatch({
      patch: {
        ffmpegError: null,
        micBlob: null,
        micRecording: false,
      },
      type: 'patch',
    });
  };

  // The cleanup checkbox is paid fal.ai cleanup when generating and free
  // Inworld noise removal when saving, so neither choice carries over.
  const changeSaveMode = (on: boolean) => {
    setSaveVoiceOnly(on);
    setSavedVoiceId(null);
    dispatch({
      patch: { referenceAudioEnhancementEnabled: false },
      type: 'patch',
    });
  };

  const textIsOverLimit = text.length > textMaxLength;
  const { maxReferenceSeconds, minReferenceSeconds: minAudioSeconds } =
    CLONE_PROVIDERS[referenceProvider];
  const micTooShort =
    !file &&
    Boolean(micBlob) &&
    micSeconds !== null &&
    micSeconds < minAudioSeconds;
  let cleanup: ReferenceCleanup = 'paid';
  if (saveVoiceOnly)
    cleanup = callCloneProvider === 'inworld' ? 'inworld' : 'none';

  const generateDisabled = selectedVoice
    ? !text.trim() ||
      status === 'generating' ||
      !hasEnoughCredits ||
      textIsOverLimit
    : !(
        (file || micBlob) &&
        (saveVoiceOnly ? voiceName.trim() : text.trim())
      ) ||
      (saveVoiceOnly &&
        (!(canSaveVoice && userHasPaid) ||
          Boolean(savedVoiceId) ||
          atVoiceLimit)) ||
      status === 'generating' ||
      !(saveVoiceOnly || hasEnoughCredits) ||
      convertingMicAudio ||
      micTooShort ||
      (!saveVoiceOnly && textIsOverLimit) ||
      !legalConsentChecked;

  return (
    <Card>
      <CardContent className="space-y-6">
        <SavedCallVoices
          disabled={status === 'generating'}
          onDelete={setVoiceToDelete}
          onSelect={(voice) => {
            setSelectedVoiceId(voice?.id ?? null);
            if (!voice) return;
            changeSaveMode(false);
            dispatch({
              patch: {
                selectedLocaleCode:
                  voice.locale ?? resolveBaseCloneLocale(selectedLocaleCode),
              },
              type: 'patch',
            });
          }}
          selectedId={selectedVoiceId}
          voices={savedVoices}
        />
        <DeleteSavedVoiceDialog
          onClose={() => setVoiceToDelete(null)}
          onDeleted={(voice) => {
            setSavedVoices((voices) =>
              voices.filter(({ id }) => id !== voice.id),
            );
            if (selectedVoiceId === voice.id) setSelectedVoiceId(null);
            if (savedVoiceId === voice.id) setSavedVoiceId(null);
          }}
          usedBy={voiceToDelete ? (voiceUsers[voiceToDelete.id] ?? []) : []}
          voice={voiceToDelete}
        />
        <Tabs
          className="w-full"
          onValueChange={(nextTab) => {
            dispatch({
              patch: {
                activeTab: nextTab === 'preview' ? 'preview' : 'upload',
              },
              type: 'patch',
            });
          }}
          value={activeTab}
        >
          <TabsList className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted/40">
            <TabsTrigger value="upload">{t('tabUpload')}</TabsTrigger>
            <TabsTrigger disabled={status !== 'complete'} value="preview">
              {t('tabPreview')}
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6 py-4" value="upload">
            <div className="grid w-full gap-6">
              {selectedVoice ? (
                <p className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-4 text-sm">
                  {t('savedVoice.using', { name: selectedVoice.name })}
                </p>
              ) : (
                <CloneAudioInput
                  ffmpeg={{
                    error: ffmpegError,
                    loading: Boolean(ffmpegLoading),
                  }}
                  maxAudioSeconds={maxReferenceSeconds}
                  mic={{
                    blob: micBlob,
                    mediaBlob: recorderMediaBlob,
                    mediaStream,
                    onClear: onClearMediaStream,
                    onDeviceChange: setMicDeviceId,
                    onToggle: onToggleMicrophone,
                    recording: micRecording,
                    status: micStatus,
                    tooShort: micTooShort,
                  }}
                  minAudioSeconds={minAudioSeconds}
                  selectedLocaleCode={selectedLocaleCode}
                  selectedLocaleName={selectedLocaleName}
                  upload={upload}
                  usesVoxtral={usesVoxtral}
                />
              )}

              <div className="grid w-full gap-6">
                {!voiceKeepsLocale && (
                  <CloneLanguageSelect
                    disabled={status === 'generating'}
                    dispatch={dispatch}
                    selectedLocaleCode={selectedLocaleCode}
                    supportedLocales={
                      selectedVoice || saveVoiceOnly
                        ? supportedLocales.filter(({ code }) =>
                            supportsCallCloneLocale(
                              selectedVoice ? 'inworld' : callCloneProvider,
                              code,
                            ),
                          )
                        : supportedLocales
                    }
                  />
                )}

                {!selectedVoice && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={saveVoiceOnly}
                      disabled={
                        !userHasPaid ||
                        status === 'generating' ||
                        (atVoiceLimit && !saveVoiceOnly)
                      }
                      id="save-voice-only"
                      onCheckedChange={(checked) => {
                        changeSaveMode(checked === true);
                        // Keep the picker on a language the call provider saves.
                        if (
                          checked === true &&
                          !supportsCallCloneLocale(
                            callCloneProvider,
                            selectedLocaleCode,
                          )
                        )
                          dispatch({
                            patch: { selectedLocaleCode: 'en' },
                            type: 'patch',
                          });
                      }}
                    />
                    <Label
                      className={cn(!userHasPaid && 'text-muted-foreground')}
                      htmlFor="save-voice-only"
                    >
                      {t('savedVoice.modeLabel')}
                    </Label>
                    {!userHasPaid && (
                      <UpgradeCrown tooltip={t('savedVoice.upgradeTooltip')} />
                    )}
                  </div>
                )}
                {userHasPaid && !selectedVoice && atVoiceLimit && (
                  <p className="text-muted-foreground text-sm">
                    {t('savedVoice.limitReached', {
                      max: MAX_SAVED_CALL_VOICES,
                    })}
                  </p>
                )}
                {saveVoiceOnly ? (
                  <div className="space-y-2">
                    <Label htmlFor="saved-voice-name">
                      {t('savedVoice.name')}
                    </Label>
                    <Input
                      disabled={status === 'generating'}
                      id="saved-voice-name"
                      maxLength={VOICE_NAME_MAX_LENGTH}
                      onChange={(e) => {
                        setVoiceName(e.target.value);
                        setSavedVoiceId(null);
                      }}
                      value={voiceName}
                    />
                    <p className="text-muted-foreground text-sm">
                      {t('savedVoice.help')}
                    </p>
                    {!canSaveVoice && (
                      <p className="text-destructive text-sm">
                        {t('errors.savedVoiceLocaleUnsupported')}
                      </p>
                    )}
                  </div>
                ) : (
                  <CloneTextField
                    disabled={status === 'generating'}
                    dispatch={dispatch}
                    selectedLocaleCode={
                      voiceKeepsLocale
                        ? (selectedVoice.locale ?? selectedLocaleCode)
                        : selectedLocaleCode
                    }
                    text={text}
                    textMaxLength={textMaxLength}
                    userHasPaid={userHasPaid}
                    usesVoxtral={
                      selectedVoice
                        ? selectedVoice.provider === 'mistral'
                        : usesVoxtral
                    }
                  />
                )}
              </div>
            </div>

            {status === 'error' && errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('errorTitle')}</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {!(saveVoiceOnly || hasEnoughCredits) && (
              <Alert className="mx-auto w-fit" variant="destructive">
                <AlertDescription>{t('notEnoughCredits')}</AlertDescription>
              </Alert>
            )}

            {!selectedVoice && (
              <CloneConsentFields
                cleanup={cleanup}
                disabled={status === 'generating'}
                dispatch={dispatch}
                legalConsentChecked={legalConsentChecked}
                referenceAudioEnhancementEnabled={
                  referenceAudioEnhancementEnabled
                }
              />
            )}

            {savedVoiceId && (
              <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-4">
                <p className="mb-2 text-sm">{t('savedVoice.success')}</p>
                <Button asChild>
                  <Link href={`/dashboard/call?custom=1&voice=${savedVoiceId}`}>
                    {t('savedVoice.useInCall')}
                  </Link>
                </Button>
              </div>
            )}
            {initialSaveForCalls && (
              <Link
                className="inline-block text-muted-foreground text-sm underline underline-offset-4"
                href="/dashboard/call?custom=1"
              >
                {t('savedVoice.backToCall')}
              </Link>
            )}
            <GenerateButton
              className="w-full"
              ctaText={t(saveVoiceOnly ? 'savedVoice.save' : 'ctaButton')}
              data-testid="clone-generate-button"
              disabled={generateDisabled}
              generatingText={
                status === 'generating'
                  ? `${t(saveVoiceOnly ? 'savedVoice.saving' : 'generating')}...`
                  : `${t('convertingAudio')}...`
              }
              isGenerating={status === 'generating' || convertingMicAudio}
              onClick={handleGenerate}
            />
            {status === 'generating' && (
              <Button
                className="mx-auto"
                onClick={handleCancel}
                variant="outline"
              >
                {t('cancelButton')}{' '}
                <CircleStop className="size-4" name="cancel" />
              </Button>
            )}
          </TabsContent>

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
