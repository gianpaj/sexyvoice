'use client';

import { Check, Mic, Play, Square, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useFFmpeg } from '@/app/[lang]/tools/audio-converter/hooks/use-ffmpeg';
import { MicrophoneVisualizer } from '@/components/audio/microphone-visualizer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatBytes } from '@/hooks/use-file-upload';
import useMediaRecorder from '@/hooks/use-media-recorder';
import { useSamplePlayer } from '@/hooks/use-sample-player';
import { type SavedCallVoice, savedVoiceSampleUrl } from '@/lib/call-voices';
import {
  CLONE_FORM_FIELDS,
  type SaveVoiceSuccessResponse,
} from '@/lib/clone/api-types';
import {
  type CallCloneProvider,
  supportsCallCloneLocale,
} from '@/lib/clone/call-voice-config';
import { CLONE_MIN_AUDIO_SECONDS } from '@/lib/clone/constants';
import { readCloneError } from '@/lib/clone/error-message';
import { createMicrophoneReferenceAudioFile } from '@/lib/clone/microphone-reference-audio';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import { cn } from '@/lib/utils';
import { PlayingBars } from './listen-button';

const MAX_RECORDING_SECONDS = 60;
const MAX_NAME_LENGTH = 50;

type Step = 'record' | 'confirm' | 'processing' | 'ready';
type Source = 'record' | 'upload';

interface CloneVoiceDialogProps {
  callCloneProvider: CallCloneProvider;
  /** Call language; fall back to English if the clone provider cannot use it. */
  language: string;
  /** The voice is saved on the server once this runs. */
  onCreated: (voice: SavedCallVoice) => void;
  onOpenChange: (open: boolean) => void;
  onUseVoice: (voice: SavedCallVoice) => void;
  open: boolean;
  /** Number of saved voices, for the default name. */
  savedCount: number;
}

const formatSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const secondaryButton =
  'h-11 rounded-[10px] border border-slate-700/70 px-4 font-medium text-[15px] text-slate-200 hover:bg-slate-800/60 disabled:pointer-events-none disabled:opacity-50';
const primaryButton =
  'h-11 rounded-[10px] bg-violet-700 px-[22px] font-semibold text-[15px] text-white hover:bg-violet-600 disabled:pointer-events-none disabled:opacity-50';

export function CloneVoiceDialog({
  callCloneProvider,
  language,
  onCreated,
  onOpenChange,
  onUseVoice,
  open,
  savedCount,
}: CloneVoiceDialogProps) {
  const t = useTranslations('call.clone');
  const tClone = useTranslations('clone');
  const minRecordingSeconds = CLONE_MIN_AUDIO_SECONDS[callCloneProvider];
  const translateErrorCode = useTranslations('errorCodes');
  const player = useSamplePlayer();
  const { convert, ensureLoaded } = useFFmpeg({ lazyLoad: true });

  const defaultName = () =>
    savedCount
      ? t('defaultNameNumbered', { count: savedCount + 1 })
      : t('defaultName');
  // Browsers without MediaRecorder can still upload a clip.
  const [canRecord] = useState(
    () => typeof window !== 'undefined' && 'MediaRecorder' in window,
  );
  const initialSource: Source = canRecord ? 'record' : 'upload';
  const [step, setStep] = useState<Step>('record');
  const [source, setSource] = useState<Source>(initialSource);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [triedCreate, setTriedCreate] = useState(false);
  const [created, setCreated] = useState<SavedCallVoice | null>(null);
  const recordingUrl = useRef<string | null>(null);
  // Set when a recording is stopped to be thrown away: `onStop` fires after
  // the state reset and would otherwise bring the take back.
  const discardStop = useRef(false);
  // Bumped by reset. A save that finishes after it still lists the voice,
  // since the server keeps it, but leaves the dialog alone.
  const requestRef = useRef(0);

  const recorder = useMediaRecorder({
    mediaStreamConstraints: { audio: true },
    onError: () => {
      if (canRecord) setProblem(t('micError'));
    },
    onStart: () => {
      discardStop.current = false;
      setRecording(null);
      setSeconds(0);
      setProblem(null);
    },
    onStop: (blob) => {
      if (discardStop.current) {
        discardStop.current = false;
        return;
      }
      setRecording(blob);
    },
  });
  const isRecording = recorder.status === 'recording';

  // A blocked microphone fails inside the recorder without calling onError.
  useEffect(() => {
    if (canRecord && recorder.status === 'failed') setProblem(t('micError'));
  }, [canRecord, recorder.status, t]);

  const discardRecording = () => {
    if (isRecording) {
      discardStop.current = true;
      recorder.stopRecording();
    }
    setRecording(null);
    setSeconds(0);
  };

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (isRecording && seconds >= MAX_RECORDING_SECONDS) {
      recorder.stopRecording();
    }
  }, [isRecording, seconds, recorder]);

  useEffect(() => {
    if (recordingUrl.current) URL.revokeObjectURL(recordingUrl.current);
    recordingUrl.current = recording ? URL.createObjectURL(recording) : null;
  }, [recording]);
  useEffect(
    () => () => {
      if (recordingUrl.current) URL.revokeObjectURL(recordingUrl.current);
    },
    [],
  );

  const reset = () => {
    requestRef.current += 1;
    discardRecording();
    recorder.clearMediaStream();
    player.stop();
    setStep('record');
    setSource(initialSource);
    setFile(null);
    setProblem(null);
    setName(defaultName());
    setConsent(false);
    setTriedCreate(false);
    setCreated(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const chooseSource = (next: Source) => {
    if (isRecording) discardRecording();
    setProblem(null);
    setSource(next);
  };

  const chooseFile = (chosen: File | undefined) => {
    if (!chosen) return;
    if (chosen.size > CLONING_FILE_MAX_SIZE) {
      setFile(null);
      setProblem(
        t('fileTooLarge', { size: formatBytes(CLONING_FILE_MAX_SIZE) }),
      );
      return;
    }
    setProblem(null);
    setFile(chosen);
  };

  const next = () => {
    if (source === 'upload' && !file) {
      setProblem(t('needFile'));
      return;
    }
    if (source === 'record') {
      if (isRecording) {
        setProblem(t('stopFirst'));
        return;
      }
      if (!recording) {
        setProblem(t('needRecording', { seconds: minRecordingSeconds }));
        return;
      }
      if (seconds < minRecordingSeconds) {
        setProblem(t('tooShort', { seconds: minRecordingSeconds }));
        return;
      }
    }
    player.stop();
    setProblem(null);
    setStep('confirm');
  };

  const create = async () => {
    setTriedCreate(true);
    if (!(name.trim() && consent)) return;
    setProblem(null);
    setStep('processing');
    requestRef.current += 1;
    const request = requestRef.current;
    const current = () => requestRef.current === request;
    const locale = supportsCallCloneLocale(callCloneProvider, language)
      ? language
      : 'en';
    try {
      let audio = file;
      if (source === 'record' && recording) {
        await ensureLoaded();
        audio = await createMicrophoneReferenceAudioFile(recording, convert);
      }
      if (!audio) throw new Error(t('needFile'));
      const form = new FormData();
      form.append(CLONE_FORM_FIELDS.file, audio);
      form.append(CLONE_FORM_FIELDS.locale, locale);
      form.append(CLONE_FORM_FIELDS.saveVoiceName, name.trim());
      form.append(CLONE_FORM_FIELDS.voiceConsent, 'true');
      const response = await fetch('/api/clone-voice', {
        body: form,
        method: 'POST',
      });
      if (!response.ok) {
        const message = await readCloneError(
          response,
          tClone,
          translateErrorCode,
        );
        if (current()) {
          setProblem(message);
          setStep('confirm');
        }
        return;
      }
      const { audioReferenceId, provider } =
        (await response.json()) as SaveVoiceSuccessResponse;
      const voice = {
        id: audioReferenceId,
        locale,
        name: name.trim(),
        provider,
      };
      onCreated(voice);
      if (!current()) return;
      setCreated(voice);
      setStep('ready');
    } catch (error) {
      if (!current()) return;
      setProblem(
        error instanceof Error && error.message
          ? error.message
          : tClone('unexpectedError'),
      );
      setStep('confirm');
    }
  };

  const steps: { key: Step | 'confirm'; label: string }[] = [
    { key: 'record', label: t('stepRecord') },
    { key: 'confirm', label: t('stepConfirm') },
    { key: 'ready', label: t('stepReady') },
  ];
  const stepIndex = { confirm: 1, processing: 1, ready: 2, record: 0 }[step];

  const recordPlaying = player.playingKey === 'clone-recording';
  const createdPlaying = player.playingKey === 'clone-created';
  let recordLabel = t('recordIdle');
  if (isRecording) recordLabel = t('recording');
  else if (recording) recordLabel = t('recorded');

  const uploadArea = file ? (
    <div className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-950/70 py-3 pr-2 pl-4">
      <PlayingBars className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-slate-50 text-sm">
          {file.name}
        </span>
        <span className="text-[13px] text-slate-400">
          {formatBytes(file.size)}
        </span>
      </div>
      <button
        aria-label={t('removeFile')}
        className="flex size-11 items-center justify-center rounded-[10px] text-slate-400 hover:bg-slate-800/60"
        onClick={() => setFile(null)}
        type="button"
      >
        <X aria-hidden="true" className="size-[18px]" />
      </button>
    </div>
  ) : (
    <label className="relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-slate-600 border-dashed bg-slate-950/70 p-5 text-center hover:border-violet-400">
      <Upload aria-hidden="true" className="size-7 text-violet-300" />
      <span className="font-semibold text-[15px] text-slate-200">
        {t.rich('dropFile', {
          browse: (chunks) => (
            <span className="text-violet-300 underline">{chunks}</span>
          ),
        })}
      </span>
      <span className="text-[13px] text-slate-400">
        {t('fileHint', {
          size: formatBytes(CLONING_FILE_MAX_SIZE),
        })}
      </span>
      <input
        accept="audio/*"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(event) => chooseFile(event.target.files?.[0])}
        type="file"
      />
    </label>
  );

  const segment = (active: boolean) =>
    cn(
      'flex h-11 items-center justify-center gap-2 rounded-[10px] border font-semibold text-sm',
      active
        ? 'border-violet-400 bg-violet-950 text-slate-50'
        : 'border-slate-700/70 text-slate-400 hover:text-slate-200',
    );

  return (
    <Dialog
      onOpenChange={(value) => (value ? onOpenChange(true) : close())}
      open={open}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[18px] border-slate-700/70 bg-slate-900 p-0 sm:max-w-[560px]"
        data-testid="clone-voice-dialog"
        showCloseButton={false}
      >
        <div className="flex items-center justify-between gap-3 pt-4 pr-3 pl-6">
          <DialogTitle className="font-bold text-xl">{t('title')}</DialogTitle>
          <button
            aria-label={t('close')}
            className="flex size-11 items-center justify-center rounded-[10px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <DialogDescription className="sr-only">
          {t('description')}
        </DialogDescription>
        <ol
          aria-label={t('steps')}
          className="flex flex-wrap items-center gap-2.5 px-6 pt-2.5"
        >
          {steps.map((item, index) => {
            const done = index < stepIndex;
            const current = index === stepIndex;
            return (
              <li
                aria-current={current ? 'step' : undefined}
                className="flex items-center gap-2"
                key={item.key}
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border-[1.5px] font-bold text-xs',
                    done && 'border-violet-400 bg-violet-400 text-slate-950',
                    current &&
                      'border-violet-400 bg-violet-950 text-violet-100',
                    !(done || current) && 'border-slate-600 text-slate-500',
                  )}
                >
                  {done ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    'text-[13px]',
                    current ? 'font-semibold text-slate-50' : 'font-medium',
                    done && 'text-violet-300',
                    !(done || current) && 'text-slate-500',
                  )}
                >
                  {item.label}
                </span>
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="h-px w-[22px] bg-slate-700"
                  />
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col gap-4 px-6 py-5">
          {step === 'record' && (
            <>
              {canRecord && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    aria-pressed={source === 'record'}
                    className={segment(source === 'record')}
                    onClick={() => chooseSource('record')}
                    type="button"
                  >
                    <Mic aria-hidden="true" className="size-4" />
                    {t('recordNow')}
                  </button>
                  <button
                    aria-pressed={source === 'upload'}
                    className={segment(source === 'upload')}
                    onClick={() => chooseSource('upload')}
                    type="button"
                  >
                    <Upload aria-hidden="true" className="size-4" />
                    {t('uploadFile')}
                  </button>
                </div>
              )}

              {source === 'record' ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-slate-300 text-sm">
                      {t('readAloud')}
                    </span>
                    <blockquote className="rounded-xl border border-slate-800 bg-slate-800/40 px-[18px] py-4 text-base text-slate-200 leading-relaxed">
                      {t('script')}
                    </blockquote>
                  </div>
                  <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3.5">
                    {isRecording && (
                      <button
                        aria-label={t('stopRecording')}
                        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-red-600 shadow-[0_0_0_6px_rgba(220,38,38,0.22)]"
                        onClick={recorder.stopRecording}
                        type="button"
                      >
                        <span className="size-4 rounded-[3px] bg-white" />
                      </button>
                    )}
                    {!isRecording && recording && (
                      <button
                        aria-label={
                          recordPlaying ? t('stopPlayback') : t('playRecording')
                        }
                        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-violet-700 text-white"
                        onClick={() =>
                          player.toggle('clone-recording', recordingUrl.current)
                        }
                        type="button"
                      >
                        {recordPlaying ? (
                          <Square
                            aria-hidden="true"
                            className="size-[18px] fill-current"
                          />
                        ) : (
                          <Play
                            aria-hidden="true"
                            className="size-[18px] fill-current"
                          />
                        )}
                      </button>
                    )}
                    {!(isRecording || recording) && (
                      <button
                        aria-label={t('startRecording')}
                        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-red-600 disabled:opacity-50"
                        disabled={recorder.status === 'acquiring_media'}
                        onClick={() => {
                          recorder
                            .startRecording()
                            .catch(() => setProblem(t('micError')));
                        }}
                        type="button"
                      >
                        <span className="size-[18px] rounded-full bg-white" />
                      </button>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-200 text-sm">
                          {recordLabel}
                        </span>
                        <span
                          className={cn(
                            'text-sm tabular-nums',
                            isRecording ? 'text-red-300' : 'text-slate-400',
                          )}
                        >
                          {formatSeconds(seconds)}
                        </span>
                      </div>
                      <div
                        aria-hidden="true"
                        className={cn(
                          'flex h-9 items-center',
                          isRecording && 'text-red-400',
                          !isRecording && recording && 'text-violet-400',
                          !(isRecording || recording) && 'text-slate-700',
                        )}
                      >
                        <MicrophoneVisualizer
                          barColor="currentColor"
                          mediaStream={recorder.mediaStream}
                        />
                      </div>
                    </div>
                  </div>
                  {!isRecording && recording && (
                    <button
                      className="-ml-3 h-10 self-start rounded-lg px-3 font-semibold text-sm text-violet-300 hover:bg-violet-950/40"
                      onClick={() => {
                        player.stop();
                        setRecording(null);
                        setSeconds(0);
                      }}
                      type="button"
                    >
                      {t('recordAgain')}
                    </button>
                  )}
                </div>
              ) : (
                uploadArea
              )}
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  className="font-semibold text-slate-200 text-sm"
                  htmlFor="clone-voice-name"
                >
                  {t('nameLabel')}
                </label>
                <input
                  aria-invalid={triedCreate && !name.trim()}
                  className={cn(
                    'h-[46px] w-full rounded-[10px] border bg-slate-950/70 px-3.5 text-[15px] text-slate-50',
                    triedCreate && !name.trim()
                      ? 'border-red-400'
                      : 'border-slate-700/70',
                  )}
                  id="clone-voice-name"
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) => setName(event.target.value)}
                  type="text"
                  value={name}
                />
                <span className="text-[13px] text-slate-500">
                  {triedCreate && !name.trim() ? (
                    <span className="text-red-300">{t('nameError')}</span>
                  ) : (
                    t('nameHelp')
                  )}
                </span>
              </div>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border bg-slate-950/70 px-4 py-3.5',
                  triedCreate && !consent
                    ? 'border-red-400'
                    : 'border-slate-700/70',
                )}
              >
                <input
                  checked={consent}
                  className="mt-0.5 size-5 shrink-0 accent-violet-400"
                  onChange={(event) => setConsent(event.target.checked)}
                  type="checkbox"
                />
                <span className="text-slate-200 text-sm leading-normal">
                  {tClone('legalConsentCheckbox')}
                </span>
              </label>
              {triedCreate && !consent && (
                <p className="-mt-1.5 text-red-300 text-sm">
                  {t('consentError')}
                </p>
              )}
            </>
          )}

          {step === 'processing' && (
            <div className="flex flex-col gap-3 py-2" role="status">
              <span className="font-semibold text-[15px] text-slate-50">
                {t('creating', { name: name.trim() })}
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-linear-to-r from-violet-600 to-blue-600" />
              </div>
              <span className="text-[13px] text-slate-400">
                {t('creatingHelp')}
              </span>
              <span className="text-[13px] text-slate-400">
                {t('creatingClose')}
              </span>
            </div>
          )}

          {step === 'ready' && created && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span
                aria-hidden="true"
                className="flex size-[52px] items-center justify-center rounded-full bg-green-950 text-green-300"
              >
                <Check className="size-[26px]" />
              </span>
              <h3 className="font-bold text-lg">
                {t('ready', { name: created.name })}
              </h3>
              <p className="text-slate-400 text-sm">{t('readyHelp')}</p>
              <button
                aria-pressed={createdPlaying}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-800/60 pr-[18px] pl-4 font-medium text-slate-200 text-sm hover:bg-slate-800"
                onClick={() =>
                  player.toggle(
                    'clone-created',
                    savedVoiceSampleUrl(created.id),
                  )
                }
                type="button"
              >
                {createdPlaying ? (
                  <Square
                    aria-hidden="true"
                    className="size-3.5 fill-current"
                  />
                ) : (
                  <Play aria-hidden="true" className="size-3.5 fill-current" />
                )}
                {createdPlaying ? t('stop') : t('hearIt')}
              </button>
            </div>
          )}

          {problem && (
            <p className="text-red-300 text-sm" role="alert">
              {problem}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2.5 border-slate-800 border-t px-6 pt-4 pb-5">
          {step === 'record' && (
            <>
              <button className={secondaryButton} onClick={close} type="button">
                {t('cancel')}
              </button>
              <button className={primaryButton} onClick={next} type="button">
                {t('next')}
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button
                className={secondaryButton}
                onClick={() => {
                  setProblem(null);
                  setStep('record');
                }}
                type="button"
              >
                {t('back')}
              </button>
              <button className={primaryButton} onClick={create} type="button">
                {t('createVoice')}
              </button>
            </>
          )}
          {step === 'processing' && (
            <button className={secondaryButton} onClick={close} type="button">
              {t('close')}
            </button>
          )}
          {step === 'ready' && created && (
            <>
              <button className={secondaryButton} onClick={reset} type="button">
                {t('recordAgain')}
              </button>
              <button
                className={primaryButton}
                onClick={() => {
                  onUseVoice(created);
                  close();
                }}
                type="button"
              >
                {t('useVoice')}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
