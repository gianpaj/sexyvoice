'use client';

import { AlertCircle, PaperclipIcon, UploadIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { MicrophoneMain } from '@/components/audio/microphone-main';
import PulsatingDots from '@/components/pulsating-dots';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatBytes, type useFileUpload } from '@/hooks/use-file-upload';
import { formatCloneMessage } from '@/lib/clone/error-message';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';

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
  /** The finished take is shorter than `minAudioSeconds`. */
  tooShort: boolean;
}

const DEFAULT_REFERENCE_AUDIO_TRIM_SECONDS = 10;
const VOXTRAL_REFERENCE_AUDIO_TRIM_SECONDS = 25;

export function CloneAudioInput({
  fileState,
  fileActions,
  mic,
  ffmpeg,
  minAudioSeconds,
  usesVoxtral,
  selectedLocaleCode,
  selectedLocaleName,
}: {
  fileState: FileUploadResult[0];
  fileActions: FileUploadResult[1];
  mic: CloneMic;
  ffmpeg: { error: string | null; loading: boolean };
  /** Shortest clip the provider that will clone this recording accepts. */
  minAudioSeconds: number;
  usesVoxtral: boolean;
  selectedLocaleCode: string;
  selectedLocaleName: string;
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
  } = fileActions;

  const file = files[0]?.file instanceof File ? files[0].file : null;

  const referenceAudioGuidance = usesVoxtral
    ? formatCloneMessage(t('referenceAudioGuidanceShort'), {
        MIN: minAudioSeconds,
        TRIM_SECONDS: VOXTRAL_REFERENCE_AUDIO_TRIM_SECONDS,
      })
    : formatCloneMessage(t('referenceAudioGuidanceLong'), {
        MIN: minAudioSeconds,
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
          {mic.tooShort && (
            <p className="text-center text-destructive text-xs" role="alert">
              {formatCloneMessage(t('errors.audioDurationInvalidVoxtral'), {
                MIN: minAudioSeconds,
              })}
            </p>
          )}
        </div>
      )}

      {ffmpeg.loading && usesVoxtral && selectedLocaleCode !== 'en' && (
        <div className="text-center text-muted-foreground text-xs">
          <span className="flex items-center justify-center gap-2">
            <PulsatingDots />
            {formatCloneMessage(t('preparingAudioProcessor'), {
              LANGUAGE: selectedLocaleName,
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
      ) : null}
    </div>
  );
}
