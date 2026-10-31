'use client';

import { AlertCircle, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { MicrophoneVisualizer } from '@/components/audio/microphone-visualizer';
import { useSamplePlayer } from '@/hooks/use-sample-player';
import { cn } from '@/lib/utils';

const PLAYER_KEY = 'voice-recording';

const formatSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Whole seconds in the current take. Keeps its value after the take stops. */
export function useRecordingSeconds(isRecording: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!isRecording) return;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);
  return seconds;
}

interface VoiceRecorderProps {
  /** Replaces the default prompt shown before the first take. */
  idleHint?: string;
  isRecording: boolean;
  mediaStream: MediaStream | null;
  /** The browser could not open the microphone. */
  micFailed: boolean;
  /** A finished take shorter than this shows an error. */
  minSeconds: number;
  onRecordAgain: () => void;
  onStart: () => void;
  onStop: () => void;
  /** The finished take, or null. */
  recording: Blob | null;
  /** From `useRecordingSeconds`. */
  seconds: number;
  /** Waiting for microphone access. */
  starting: boolean;
}

/** Record button, timer and playback for a voice sample. */
export function VoiceRecorder({
  idleHint,
  isRecording,
  mediaStream,
  micFailed,
  minSeconds,
  onRecordAgain,
  onStart,
  onStop,
  recording,
  seconds,
  starting,
}: VoiceRecorderProps) {
  const t = useTranslations('voiceRecorder');
  const player = useSamplePlayer();
  const recordingUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const url = URL.createObjectURL(recording);
    recordingUrl.current = url;
    return () => {
      URL.revokeObjectURL(url);
      recordingUrl.current = null;
    };
  }, [recording]);

  const hasTake = !isRecording && recording !== null;
  const playing = player.playingKey === PLAYER_KEY;

  let label = idleHint ?? t('idle', { seconds: minSeconds });
  if (isRecording) {
    label =
      seconds < minSeconds
        ? t('keepTalking', { seconds: minSeconds - seconds })
        : t('recording');
  } else if (recording) {
    label = t('recorded');
  }

  let error: string | null = null;
  if (hasTake && seconds < minSeconds) {
    error = t('tooShort', { seconds: minSeconds });
  } else if (micFailed && !isRecording) {
    error = t('micError');
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'flex items-center gap-4 rounded-xl border bg-slate-950/70 px-4 py-3.5',
          error ? 'border-red-400/70' : 'border-slate-800',
        )}
      >
        {isRecording && (
          <button
            aria-label={t('stopRecording')}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-red-600 shadow-[0_0_0_6px_rgba(220,38,38,0.22)]"
            onClick={onStop}
            type="button"
          >
            <span className="size-4 rounded-[3px] bg-white" />
          </button>
        )}
        {hasTake && (
          <button
            aria-label={playing ? t('stopPlayback') : t('playRecording')}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-violet-700 text-white"
            onClick={() => player.toggle(PLAYER_KEY, recordingUrl.current)}
            type="button"
          >
            {playing ? (
              <Square aria-hidden="true" className="size-[18px] fill-current" />
            ) : (
              <Play aria-hidden="true" className="size-[18px] fill-current" />
            )}
          </button>
        )}
        {!(isRecording || recording) && (
          <button
            aria-label={t('startRecording')}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-red-600 disabled:opacity-50"
            disabled={starting}
            onClick={onStart}
            type="button"
          >
            <span className="size-[18px] rounded-full bg-white" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-200 text-sm">
              {label}
            </span>
            <span
              className={cn(
                'text-sm tabular-nums',
                isRecording ? 'text-red-300' : 'text-slate-400',
              )}
            >
              {formatSeconds(isRecording || recording ? seconds : 0)}
            </span>
          </div>
          <div
            aria-hidden="true"
            className={cn(
              'flex h-9 items-center',
              isRecording && 'text-red-400',
              hasTake && 'text-violet-400',
              !(isRecording || recording) && 'text-slate-700',
            )}
          >
            <MicrophoneVisualizer
              barColor="currentColor"
              mediaStream={mediaStream}
            />
          </div>
        </div>
      </div>
      {error && (
        <p
          className="flex items-start gap-1.5 text-red-300 text-sm"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      {hasTake && (
        <button
          className="-ml-3 h-10 self-start rounded-lg px-3 font-semibold text-sm text-violet-300 hover:bg-violet-950/40"
          onClick={() => {
            player.stop();
            onRecordAgain();
          }}
          type="button"
        >
          {t('recordAgain')}
        </button>
      )}
    </div>
  );
}
