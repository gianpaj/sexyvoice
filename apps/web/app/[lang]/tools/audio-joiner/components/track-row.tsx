'use client';

import WavesurferPlayer from '@wavesurfer/react';
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef } from 'react';
import type WaveSurfer from 'wavesurfer.js';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTime } from '../format-time';

interface TrackRowProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  disabled?: boolean;
  durationSec: number;
  endSec: number;
  /** Global timeline offset that precedes this track's trimmed region. */
  globalOffsetSec?: number;
  name: string;
  onDelete: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onReady: (durationSec: number) => void;
  /** Called with the new global timeline position (seconds) when the user
   *  clicks the waveform to seek. */
  onSeek?: (globalTimeSec: number) => void;
  onTrimChange: (nextStartSec: number, nextEndSec: number) => void;
  /** Playhead position as a percentage (0–100) of the full waveform width,
   *  or null when the playhead is outside this track's active window. */
  playheadPct?: number | null;
  startSec: number;
  url: string;
}

const MIN_TRIM_GAP_SEC = 0.05;
const TRIM_STEP_SEC = 0.1;
const LARGE_TRIM_STEP_SEC = 1;

type TrimHandle = 'start' | 'end';

export function TrackRow({
  name,
  url,
  durationSec,
  startSec,
  endSec,
  playheadPct = null,
  globalOffsetSec = 0,
  disabled = false,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDelete,
  onTrimChange,
  onReady,
  onSeek,
}: TrackRowProps) {
  const t = useTranslations('audioJoiner.track');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragTypeRef = useRef<TrimHandle | null>(null);
  // Track whether the pointer moved enough to be considered a drag vs a click.
  const didDragRef = useRef(false);

  const startPct = durationSec > 0 ? (startSec / durationSec) * 100 : 0;

  const endPct = durationSec > 0 ? (endSec / durationSec) * 100 : 100;

  const handleWaveReady = (ws: WaveSurfer) => {
    const nextDurationSec = ws.getDuration();
    if (nextDurationSec > 0) {
      onReady(nextDurationSec);
    }
  };

  // Each handle stops MIN_TRIM_GAP_SEC short of the other one.
  const startMaxSec = Math.max(0, endSec - MIN_TRIM_GAP_SEC);
  const endMinSec = Math.min(durationSec, startSec + MIN_TRIM_GAP_SEC);

  const moveTrimHandle = (handle: TrimHandle, positionSec: number) => {
    const nextStartSec =
      handle === 'start'
        ? Math.max(0, Math.min(positionSec, startMaxSec))
        : startSec;
    const nextEndSec =
      handle === 'end'
        ? Math.min(durationSec, Math.max(positionSec, endMinSec))
        : endSec;

    // A trim change stops the preview, so skip moves that change nothing,
    // such as Home on a handle already at 0.
    if (nextStartSec === startSec && nextEndSec === endSec) {
      return;
    }
    onTrimChange(nextStartSec, nextEndSec);
  };

  const updateTrimFromPointer = (clientX: number) => {
    const root = containerRef.current;
    if (!(root && dragTypeRef.current) || durationSec <= 0) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    moveTrimHandle(dragTypeRef.current, ratio * durationSec);
  };

  const handleTrimKeyDown =
    (handle: TrimHandle) => (event: React.KeyboardEvent) => {
      if (disabled || durationSec <= 0) {
        return;
      }

      const currentSec = handle === 'start' ? startSec : endSec;
      const stepSec = event.shiftKey ? LARGE_TRIM_STEP_SEC : TRIM_STEP_SEC;
      const nextSec = {
        ArrowDown: currentSec - stepSec,
        ArrowLeft: currentSec - stepSec,
        ArrowRight: currentSec + stepSec,
        ArrowUp: currentSec + stepSec,
        End: durationSec,
        Home: 0,
        PageDown: currentSec - LARGE_TRIM_STEP_SEC,
        PageUp: currentSec + LARGE_TRIM_STEP_SEC,
      }[event.key];

      if (nextSec === undefined) {
        return;
      }

      event.preventDefault();
      // Round to milliseconds so repeated 0.1 s steps don't drift.
      moveTrimHandle(handle, Math.round(nextSec * 1000) / 1000);
    };

  const onPointerMove = useEffectEvent((clientX: number) => {
    if (!dragTypeRef.current || disabled) return;
    updateTrimFromPointer(clientX);
  });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      onPointerMove(event.clientX);
    };

    const handlePointerUp = () => {
      dragTypeRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleStartPointerDown = (event: React.PointerEvent) => {
    if (disabled) {
      return;
    }

    // Keep pointer drags from focusing the handle, so Space after a drag
    // still reaches the global play/pause handler.
    event.preventDefault();
    // Stop propagation so the event doesn't bubble to the waveform container
    // and reset didDragRef to false via handleWaveformPointerDown.
    event.stopPropagation();
    dragTypeRef.current = 'start';
    didDragRef.current = true; // treat handle interaction as a drag
    updateTrimFromPointer(event.clientX);
  };

  const handleEndPointerDown = (event: React.PointerEvent) => {
    if (disabled) {
      return;
    }

    // Keep pointer drags from focusing the handle, so Space after a drag
    // still reaches the global play/pause handler.
    event.preventDefault();
    // Stop propagation so the event doesn't bubble to the waveform container
    // and reset didDragRef to false via handleWaveformPointerDown.
    event.stopPropagation();
    dragTypeRef.current = 'end';
    didDragRef.current = true; // treat handle interaction as a drag
    updateTrimFromPointer(event.clientX);
  };

  // Waveform body click → seek. Only fires when no trim handle drag occurred.
  const handleWaveformPointerDown = () => {
    didDragRef.current = false;
  };

  const handleWaveformClick = (event: React.MouseEvent) => {
    if (disabled || didDragRef.current || !onSeek || durationSec <= 0) {
      return;
    }

    // Ignore keyboard-triggered clicks (Space/Enter on a focused child) which
    // report clientX/clientY as 0 and would incorrectly seek to the start.
    if (event.detail === 0) {
      return;
    }

    const root = containerRef.current;
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const localSec = ratio * durationSec;

    // Clamp to the trimmed region so seek stays within active audio.
    const clampedLocalSec = Math.max(startSec, Math.min(endSec, localSec));

    // Convert to global timeline position.
    const globalTimeSec = globalOffsetSec + (clampedLocalSec - startSec);
    onSeek(globalTimeSec);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-4">
      <p className="mb-2 truncate text-muted-foreground text-sm">{name}</p>

      <div className="flex gap-3">
        {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: needed */}
        {/** biome-ignore lint/a11y/useKeyWithClickEvents: needed */}
        {/** biome-ignore lint/a11y/noStaticElementInteractions: needed */}
        <div
          className={cn(
            'relative flex-1 cursor-default text-left',
            onSeek && !disabled && 'cursor-pointer',
          )}
          onClick={handleWaveformClick}
          onPointerDown={handleWaveformPointerDown}
          ref={containerRef}
        >
          <div className="pointer-events-none">
            <WavesurferPlayer
              barGap={2}
              barRadius={3}
              barWidth={2}
              cursorColor="transparent"
              dragToSeek={false}
              // height={84}
              interact={false}
              onReady={handleWaveReady}
              progressColor="#10b981"
              url={url}
              waveColor="#94a3b8"
            />
          </div>

          <div
            className="absolute top-0 z-10 h-full border-cyan-300 border-l-2"
            style={{ left: `${startPct}%` }}
          />
          <div
            aria-disabled={disabled}
            aria-label={t('trimStart')}
            aria-orientation="horizontal"
            aria-valuemax={startMaxSec}
            aria-valuemin={0}
            aria-valuenow={startSec}
            aria-valuetext={formatTime(startSec)}
            className={cn(
              'absolute top-0 z-10 flex h-full w-7 -translate-x-1/2 touch-none flex-col items-center justify-center',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            onKeyDown={handleTrimKeyDown('start')}
            onPointerDown={handleStartPointerDown}
            role="slider"
            style={{ left: `${startPct}%` }}
            tabIndex={disabled ? -1 : 0}
          >
            <GripVertical className="h-4 w-4 text-cyan-200" />
          </div>

          <div
            className="absolute top-0 z-10 h-full border-cyan-300 border-l-2"
            style={{ left: `${endPct}%` }}
          />
          <div
            aria-disabled={disabled}
            aria-label={t('trimEnd')}
            aria-orientation="horizontal"
            aria-valuemax={durationSec}
            aria-valuemin={endMinSec}
            aria-valuenow={endSec}
            aria-valuetext={formatTime(endSec)}
            className={cn(
              'absolute top-0 z-10 flex h-full w-7 -translate-x-1/2 touch-none flex-col items-center justify-center',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            onKeyDown={handleTrimKeyDown('end')}
            onPointerDown={handleEndPointerDown}
            role="slider"
            style={{ left: `${endPct}%` }}
            tabIndex={disabled ? -1 : 0}
          >
            <GripVertical className="h-4 w-4 text-cyan-200" />
          </div>

          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-slate-950/40"
            style={{ width: `${startPct}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 bg-slate-950/40"
            style={{ width: `${100 - endPct}%` }}
          />

          {/* Playhead */}
          {playheadPct !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 h-full w-px bg-white/90 shadow-[0_0_4px_1px_rgba(255,255,255,0.6)] transition-[left] duration-100 ease-linear"
              style={{ left: `${playheadPct}%` }}
            />
          )}
        </div>

        <div className="flex w-12 flex-col gap-2">
          <Button
            aria-label={t('moveUp')}
            disabled={disabled || !canMoveUp}
            onClick={onMoveUp}
            size="icon"
            type="button"
            variant="secondary"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            aria-label={t('moveDown')}
            disabled={disabled || !canMoveDown}
            onClick={onMoveDown}
            size="icon"
            type="button"
            variant="secondary"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            aria-label={t('delete')}
            disabled={disabled}
            onClick={onDelete}
            size="icon"
            type="button"
            variant="destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex justify-between text-muted-foreground text-xs">
        <span>{t('start', { time: formatTime(startSec) })}</span>
        <span>{t('end', { time: formatTime(endSec) })}</span>
        <span>{t('duration', { time: formatTime(endSec - startSec) })}</span>
      </div>
    </div>
  );
}
