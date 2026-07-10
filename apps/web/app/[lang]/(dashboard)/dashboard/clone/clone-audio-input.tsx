'use client';

import { AlertCircle, PaperclipIcon, UploadIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';

import { MicrophoneMain } from '@/components/audio/microphone-main';
import PulsatingDots from '@/components/pulsating-dots';
import { Accordion } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatBytes, type useFileUpload } from '@/hooks/use-file-upload';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import type { SampleAudio } from './clone-sample-card';
import CloneSampleCard from './clone-sample-card';
import type { Status } from './clone-state';
import { type CloneStateAction, formatCloneMessage } from './clone-state';

type FileUploadResult = ReturnType<typeof useFileUpload>;

type MicStatus =
  | 'idle'
  | 'acquiring_media'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'failed';

interface CloneMic {
  blob: Blob | null;
  mediaBlob: Blob | null;
  mediaStream: MediaStream | null;
  onClear: () => void;
  onToggle: () => void;
  recording: boolean;
  status: MicStatus;
}

const DEFAULT_MIN_AUDIO_DURATION_SECONDS = 10;
const DEFAULT_REFERENCE_AUDIO_TRIM_SECONDS = 10;
const VOXTRAL_MIN_AUDIO_DURATION_SECONDS = 3;
const VOXTRAL_REFERENCE_AUDIO_TRIM_SECONDS = 25;

const sampleAudios: readonly SampleAudio[] = [
  {
    id: 1,
    name: 'Marilyn Monroe 🇺🇸',
    language: 'english',
    prompt: "I don't need diamonds, darling. I need stable Wi-Fi and a nap",
    audioSrc: 'clone-en-audio-samples/marilyn_monroe-1952.mp3',
    audioExampleOutputSrc:
      'clone-en-audio-samples/marilyn_monroe-diamonds-wifi.mp3',
    image: 'https://images.sexyvoice.ai/clone/marilyn-monroe.avif',
  },
  // {
  //   id: 2,
  //   name: 'Morgan Freeman 🇺🇸',
  //   prompt: 'The most important thing is the mission, not the money',
  //   audioExampleOutputSrc: 'clone-en-audio-samples/morgan_freeman.mp3',
  //   audioSrc: 'clone-en-audio-samples/morgan_freeman.mp3',
  // },
  // {
  //   id: 3,
  //   name: 'Audrey Hepburn 🇬🇧',
  //   prompt: 'Elegance is not about being noticed, it is about being remembered',
  //   audioExampleOutputSrc: 'clone-en-audio-samples/audrey_hepburn.mp3',
  //   audioSrc: 'clone-en-audio-samples/audrey_hepburn.mp3',
  // },
  // https://maskgct.github.io/audios/celeb_samples/rick_0.wav
];

export function CloneAudioInput({
  fileState,
  fileActions,
  mic,
  ffmpeg,
  usesVoxtral,
  selectedLocale,
  onSelectSample,
  dispatch,
}: {
  fileState: FileUploadResult[0];
  fileActions: FileUploadResult[1];
  mic: CloneMic;
  ffmpeg: { error: string | null; loading: boolean };
  usesVoxtral: boolean;
  selectedLocale: { code: string; value: string };
  onSelectSample: (sample: SampleAudio) => void;
  dispatch: Dispatch<CloneStateAction>;
}) {
  const t = useTranslations('clone');
  const { files, isDragging, errors } = fileState;
  const {
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    openFileDialog,
    removeFile,
    getInputProps,
    addFiles,
  } = fileActions;

  const file = files[0]?.file instanceof File ? files[0].file : null;

  const minAudioDuration = usesVoxtral
    ? VOXTRAL_MIN_AUDIO_DURATION_SECONDS
    : DEFAULT_MIN_AUDIO_DURATION_SECONDS;
  const referenceAudioGuidance = usesVoxtral
    ? formatCloneMessage(t('referenceAudioGuidanceShort'), {
        MIN: minAudioDuration,
        TRIM_SECONDS: VOXTRAL_REFERENCE_AUDIO_TRIM_SECONDS,
      })
    : formatCloneMessage(t('referenceAudioGuidanceLong'), {
        MIN: minAudioDuration,
        TRIM_SECONDS: DEFAULT_REFERENCE_AUDIO_TRIM_SECONDS,
      });

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="audio-file">{t('audioFileLabel')}</Label>

      {/* Drop area */}
      {!(file || mic.recording) && (
        <button
          className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-input border-dashed p-4 transition-colors hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50 has-[input:focus]:border-ring has-[input:focus]:ring-[3px] has-[input:focus]:ring-ring/50 data-[dragging=true]:bg-accent/50"
          data-dragging={isDragging || undefined}
          data-testid="clone-upload-dropzone"
          disabled={Boolean(mic.recording)}
          onClick={openFileDialog}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          type="button"
        >
          <input
            {...getInputProps()}
            aria-label="Upload audio file"
            className="sr-only"
            disabled={Boolean(file) || Boolean(mic.blob)}
          />

          <div className="flex flex-col items-center justify-center text-center">
            <div
              aria-hidden="true"
              className="mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border bg-background"
            >
              <UploadIcon className="size-4 opacity-60" />
            </div>
            <p className="mb-1.5 font-medium text-sm">{t('uploadAudioFile')}</p>
            <p className="text-muted-foreground text-xs">{t('dragDropText')}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('fileFormatsText').replace(
                '__SIZE__',
                formatBytes(CLONING_FILE_MAX_SIZE),
              )}
            </p>
            <p className="mt-2 text-muted-foreground text-xs italic">
              {referenceAudioGuidance}
            </p>
          </div>
        </button>
      )}

      {!file && (
        <div className="grid gap-3 rounded-xl border border-input border-dashed p-4">
          <p className="text-center text-xs">{t('orUseMicrophone')}</p>
          {ffmpeg.loading && usesVoxtral && (
            <div className="flex items-center justify-center gap-2 py-2">
              <PulsatingDots />
              <span className="text-muted-foreground text-xs">
                {t('loadingAudioProcessor')}
              </span>
            </div>
          )}
          {ffmpeg.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('audioProcessorError')}</AlertTitle>
              <AlertDescription>{ffmpeg.error}</AlertDescription>
            </Alert>
          )}
          <MicrophoneMain
            mediaBlob={mic.mediaBlob}
            mediaStream={mic.mediaStream}
            onClearMediaStream={mic.onClear}
            onToggleMicrophone={mic.onToggle}
            status={mic.status}
          />
        </div>
      )}

      {/* FFmpeg loading message for non-English locales */}
      {ffmpeg.loading && selectedLocale.code !== 'en' && (
        <div className="text-center text-muted-foreground text-xs">
          <span className="flex items-center justify-center gap-2">
            <PulsatingDots />
            {formatCloneMessage(t('preparingAudioProcessor'), {
              LANGUAGE: selectedLocale.value,
            })}
          </span>
        </div>
      )}

      {/* File upload errors */}
      {errors.length > 0 && (
        <div
          className="flex items-center gap-1 text-destructive text-xs"
          role="alert"
        >
          <AlertCircle className="size-3 shrink-0" />
          <span>{errors[0]}</span>
        </div>
      )}

      {/* Selected file display */}
      {file ? (
        <div
          className="flex items-center justify-between gap-2 rounded-xl border px-4 py-2"
          key={files[0]?.id}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <PaperclipIcon
              aria-hidden="true"
              className="size-4 shrink-0 opacity-60"
            />
            <div className="min-w-0">
              <p className="truncate whitespace-normal break-all font-medium text-[13px]">
                {file.name}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatBytes(file.size)}
              </p>
            </div>
          </div>

          <Button
            aria-label={t('removeFile')}
            className="-me-2 size-12 text-muted-foreground/80 hover:bg-transparent hover:text-foreground"
            onClick={() => removeFile(files[0]?.id)}
            size="icon"
            variant="ghost"
          >
            <XIcon aria-hidden="true" className="size-6!" />
          </Button>
        </div>
      ) : (
        !mic.blob && (
          // Sample audio demo buttons
          <div className="grid w-full gap-2">
            <p className="text-muted-foreground text-xs">{t('tryDemo')}</p>

            <Accordion className="w-full" collapsible type="single">
              {sampleAudios.map((sample) => (
                <CloneSampleCard
                  addFiles={addFiles}
                  key={sample.id}
                  onSelectSample={onSelectSample}
                  sample={sample}
                  setErrorMessage={(nextErrorMessage) => {
                    dispatch({
                      type: 'patch',
                      patch: { errorMessage: nextErrorMessage },
                    });
                  }}
                  setStatus={(nextStatus: Status) => {
                    dispatch({
                      type: 'patch',
                      patch: { status: nextStatus },
                    });
                  }}
                />
              ))}
            </Accordion>
          </div>
        )
      )}
    </div>
  );
}
