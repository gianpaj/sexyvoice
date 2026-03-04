'use client';

import WavesurferPlayer from '@wavesurfer/react';
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type WaveSurfer from 'wavesurfer.js';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TrackRowProps {
  name: string;
  url: string;
  durationSec: number;
  startSec: number;
  endSec: number;
  /** Playhead position as a percentage (0–100) of the full waveform width,
   *  or null when the playhead is outside this track's active window. */
  playheadPct?: number | null;
  /** Global timeline offset that precedes this track's trimmed region. */
  globalOffsetSec?: number;
  disabled?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onTrimChange: (nextStartSec: number, nextEndSec: number) => void;
  onReady: (durationSec: number) => void;
  /** Called with the new global timeline position (seconds) when the user
   *  clicks the waveform to seek. */
  onSeek?: (globalTimeSec: number) => void;
}

const MIN_TRIM_GAP_SEC = 0.05;

function formatTime(valueSec: number): string {
  const minutes = Math.floor(valueSec / 60);
  const seconds = Math.floor(valueSec % 60);
  const tenths = Math.floor((valueSec % 1) * 10);
  const paddedSeconds = `${seconds}`.padStart(2, '0');

  return `${minutes}:${paddedSeconds}.${tenths}`;
}

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
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const dragTypeRef = useRef<'start' | 'end' | null>(null);
  // Track whether the pointer moved enough to be considered a drag vs a click.
  const didDragRef = useRef(false);

  const startPct = useMemo(
    () => (durationSec > 0 ? (startSec / durationSec) * 100 : 0),
    [durationSec, startSec],
  );

  const endPct = useMemo(
    () => (durationSec > 0 ? (endSec / durationSec) * 100 : 100),
    [durationSec, endSec],
  );

  const handleWaveReady = useCallback(
    (ws: WaveSurfer) => {
      const nextDurationSec = ws.getDuration();
      if (nextDurationSec > 0) {
        onReady(nextDurationSec);
      }
    },
    [onReady],
  );

  const updateTrimFromPointer = useCallback(
    (clientX: number) => {
      const root = containerRef.current;
      if (!root || durationSec <= 0) {
        return;
      }

      const rect = root.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      const positionSec = ratio * durationSec;

      if (dragTypeRef.current === 'start') {
        const nextStartSec = Math.min(positionSec, endSec - MIN_TRIM_GAP_SEC);
        onTrimChange(Math.max(0, nextStartSec), endSec);
      }

      if (dragTypeRef.current === 'end') {
        const nextEndSec = Math.max(positionSec, startSec + MIN_TRIM_GAP_SEC);
        onTrimChange(startSec, Math.min(durationSec, nextEndSec));
      }
    },
    [durationSec, startSec, endSec, onTrimChange],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragTypeRef.current || disabled) {
        return;
      }
      updateTrimFromPointer(event.clientX);
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
  }, [disabled, updateTrimFromPointer]);

  const handleStartPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) {
        return;
      }

      // Stop propagation so the event doesn't bubble to the waveform container
      // and reset didDragRef to false via handleWaveformPointerDown.
      event.stopPropagation();
      dragTypeRef.current = 'start';
      didDragRef.current = true; // treat handle interaction as a drag
      updateTrimFromPointer(event.clientX);
    },
    [disabled, updateTrimFromPointer],
  );

  const handleEndPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) {
        return;
      }

      // Stop propagation so the event doesn't bubble to the waveform container
      // and reset didDragRef to false via handleWaveformPointerDown.
      event.stopPropagation();
      dragTypeRef.current = 'end';
      didDragRef.current = true; // treat handle interaction as a drag
      updateTrimFromPointer(event.clientX);
    },
    [disabled, updateTrimFromPointer],
  );

  // Waveform body click → seek. Only fires when no trim handle drag occurred.
  const handleWaveformPointerDown = useCallback(() => {
    didDragRef.current = false;
  }, []);

  const handleWaveformClick = useCallback(
    (event: React.MouseEvent) => {
      if (disabled || didDragRef.current || !onSeek || durationSec <= 0) {
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
    },
    [disabled, onSeek, durationSec, startSec, endSec, globalOffsetSec],
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-4">
      <p className="mb-2 truncate text-muted-foreground text-sm">{name}</p>

      <div className="flex gap-3">
        <button
          aria-label="Seek playback position"
          className={cn(
            'relative flex-1 cursor-default text-left',
            onSeek && !disabled && 'cursor-pointer',
          )}
          disabled={disabled}
          onClick={handleWaveformClick}
          onPointerDown={handleWaveformPointerDown}
          ref={containerRef}
          type="button"
        >
          <WavesurferPlayer
            barGap={2}
            barRadius={3}
            barWidth={2}
            cursorColor="transparent"
            dragToSeek={false}
            height={84}
            interact={false}
            onReady={handleWaveReady}
            progressColor="#10b981"
            url={url}
            waveColor="#94a3b8"
          />

          <div
            className="absolute top-0 h-full border-cyan-300 border-l-2"
            style={{ left: `${startPct}%` }}
          />
          <button
            aria-label="Trim start"
            className={cn(
              'absolute top-0 flex h-full w-7 -translate-x-1/2 touch-none flex-col items-center justify-center',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            onPointerDown={handleStartPointerDown}
            style={{ left: `${startPct}%` }}
            type="button"
          >
            <GripVertical className="h-4 w-4 text-cyan-200" />
          </button>

          <div
            className="absolute top-0 h-full border-cyan-300 border-l-2"
            style={{ left: `${endPct}%` }}
          />
          <button
            aria-label="Trim end"
            className={cn(
              'absolute top-0 flex h-full w-7 -translate-x-1/2 touch-none flex-col items-center justify-center',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            onPointerDown={handleEndPointerDown}
            style={{ left: `${endPct}%` }}
            type="button"
          >
            <GripVertical className="h-4 w-4 text-cyan-200" />
          </button>

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
        </button>

        <div className="flex w-12 flex-col gap-2">
          <Button
            aria-label="Move segment up"
            disabled={disabled || !canMoveUp}
            onClick={onMoveUp}
            size="icon"
            type="button"
            variant="secondary"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Move segment down"
            disabled={disabled || !canMoveDown}
            onClick={onMoveDown}
            size="icon"
            type="button"
            variant="secondary"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Delete segment"
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
        <span>Start: {formatTime(startSec)}</span>
        <span>End: {formatTime(endSec)}</span>
        <span>Duration: {formatTime(endSec - startSec)}</span>
      </div>
    </div>
  );
}
