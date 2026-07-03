'use client';

import { AlertCircle, CircleStop, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
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
import { CloneConsentFields } from './clone-consent-fields';
import { CloneLanguageSelect } from './clone-language-select';
import type { SampleAudio } from './clone-sample-card';
import {
  cloneStateReducer,
  formatCloneMessage,
  initialCloneState,
} from './clone-state';
import { CloneTextField } from './clone-text-field';

export type { Status } from './clone-state';

const ALLOWED_TYPES =
  'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/x-wav,audio/m4a,audio/x-m4a,audio/opus,audio/x-opus,video/webm,.opus';

const SUPPORTED_LOCALE_CODES: Record<string, string> = {
  ar: 'arabic',
  da: 'danish',
  de: 'german',
  el: 'greek',
  en: 'english',
  'en-multi': 'english',
  es: 'spanish',
  fi: 'finnish',
  fr: 'french',
  he: 'hebrew',
  hi: 'hindi',
  it: 'italian',
  ja: 'japanese',
  ko: 'korean',
  ms: 'malay',
  nl: 'dutch',
  no: 'norwegian',
  pl: 'polish',
  pt: 'portuguese',
  ru: 'russian',
  sv: 'swedish',
  sw: 'swahili',
  tr: 'turkish',
  zh: 'chinese',
};

// The server returns `CloneErrorResponseBody`, but proxies and older responses
// may omit fields, so every field is treated as optional here. `message` is not
// part of the route contract but can arrive from upstream/proxy error bodies.
type CloneErrorResponse = Partial<CloneErrorResponseBody> & {
  message?: string;
};

type CloneTranslator = ReturnType<typeof useTranslations<'clone'>>;

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
    legalConsentChecked,
    micBlob,
    micRecording,
    referenceAudioEnhancementEnabled,
    selectedLocale,
    status,
    text,
  } = cloneState;

  const usesVoxtral = VOXTRAL_SUPPORTED_LOCALE_CODES.has(selectedLocale.code);

  // Preload FFmpeg when Voxtral locale is selected
  useEffect(() => {
    if (usesVoxtral) {
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
  }, [usesVoxtral, ensureLoaded, t]);

  const handleStartRecording = async () => {
    try {
      dispatch({ type: 'patch', patch: { ffmpegError: null } });
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

  const supportedLocales = (() => {
    const codes = Object.keys(SUPPORTED_LOCALE_CODES);
    const translated = getTranslatedLanguages(lang, codes);
    const merged = translated.map(({ value: code, label }) => ({
      code,
      value: SUPPORTED_LOCALE_CODES[code] || code,
      name: label,
    }));
    const current = merged.find((l) => l.code === lang);
    const rest = merged.filter((l) => l.code !== lang);
    return current ? [current, ...rest] : merged;
  })();

  const onFilesAdded = useCallback(() => {
    dispatch({
      type: 'patch',
      patch: {
        status: 'idle',
        errorMessage: '',
      },
    });
  }, []);

  const textMaxLength = getCloneTextMaxLength(selectedLocale.code, userHasPaid);

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

      // First upload and process the voice
      const formData = new FormData();
      formData.append(CLONE_FORM_FIELDS.file, audioToProcess);
      formData.append(CLONE_FORM_FIELDS.text, text);
      formData.append(CLONE_FORM_FIELDS.locale, selectedLocale.code);
      formData.append(
        CLONE_FORM_FIELDS.enhanceReferenceAudio,
        String(referenceAudioEnhancementEnabled),
      );

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

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();

      if (
        status !== 'generating' &&
        text.trim() &&
        hasEnoughCredits &&
        legalConsentChecked
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

  const textIsOverLimit = text.length > textMaxLength;

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs
          className="w-full"
          onValueChange={(nextTab) => {
            dispatch({
              type: 'patch',
              patch: {
                activeTab: nextTab === 'preview' ? 'preview' : 'upload',
              },
            });
          }}
          value={activeTab}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">{t('tabUpload')}</TabsTrigger>
            <TabsTrigger disabled={status !== 'complete'} value="preview">
              {t('tabPreview')}
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6 py-4" value="upload">
            <div className="grid w-full gap-6">
              <CloneAudioInput
                dispatch={dispatch}
                ffmpeg={{ error: ffmpegError, loading: Boolean(ffmpegLoading) }}
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
                usesVoxtral={usesVoxtral}
              />

              <div className="grid w-full gap-6">
                <CloneLanguageSelect
                  disabled={status === 'generating'}
                  dispatch={dispatch}
                  selectedLocale={selectedLocale}
                  supportedLocales={supportedLocales}
                />

                <CloneTextField
                  disabled={status === 'generating'}
                  dispatch={dispatch}
                  text={text}
                  textMaxLength={textMaxLength}
                  userHasPaid={userHasPaid}
                  usesVoxtral={usesVoxtral}
                />
              </div>
            </div>

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

            <CloneConsentFields
              disabled={status === 'generating'}
              dispatch={dispatch}
              legalConsentChecked={legalConsentChecked}
              referenceAudioEnhancementEnabled={
                referenceAudioEnhancementEnabled
              }
            />

            <GenerateButton
              className="w-full"
              ctaText={t('ctaButton')}
              data-testid="clone-generate-button"
              disabled={
                !((file || micBlob) && text.trim()) ||
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
