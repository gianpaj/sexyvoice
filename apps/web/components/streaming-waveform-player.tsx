'use client';

import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

import { Button } from '@/components/ui/button';
import { attemptPlayback } from '@/lib/media-playback';
import { cn } from '@/lib/utils';
import type { StreamingWaveformPlayer as StreamingController } from './audio-generator/hooks/use-streaming-waveform-player';
import type { AudioPlayerControls } from './audio-player-with-context';

interface StreamingWaveformPlayerProps {
  buttonClassName?: string;
  className?: string;
  controller: StreamingController;
  /** Rough expected total duration (seconds) so the live waveform fills toward
   * the full length left→right instead of rescaling to fit on every chunk. */
  estimatedDurationSec?: number;
  onControlsReady?: (controls: AudioPlayerControls) => void;
  playAudioTitle: string;
  progressColor?: string;
  waveColor?: string;
  waveformClassName?: string;
  waveformHeight?: number;
}

/**
 * A single wavesurfer instance that renders the live waveform from streamed PCM
 * peaks (no media) during the `streaming` phase, then hands off to the
 * assembled WAV blob for seek/replay in the `file` phase. The play/pause button
 * is the sole control: it drives the Web Audio engine while streaming and
 * wavesurfer once the file is loaded.
 */
export function StreamingWaveformPlayer({
  controller,
  estimatedDurationSec = 0,
  playAudioTitle,
  className,
  waveformClassName,
  buttonClassName,
  waveColor = '#888888',
  progressColor = '#8b5cf6',
  waveformHeight = 48,
  onControlsReady,
}: StreamingWaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const loadedFileRef = useRef(false);
  // Once the file blob is handed off, stop the streaming loop from issuing more
  // `load('')` calls that could clobber the seekable media element.
  const handedOffRef = useRef(false);
  const [isWsPlaying, setIsWsPlaying] = useState(false);
  const [isWsReady, setIsWsReady] = useState(false);

  const {
    phase,
    isLivePlaying,
    wavBlob,
    getPeaks,
    getDuration,
    getCurrentTime,
    getHandoff,
  } = controller;

  // Create the wavesurfer instance once on mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: instance is created once; presentation props are stable per mount
  useEffect(() => {
    if (!containerRef.current) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: waveformHeight,
      waveColor,
      progressColor,
      cursorColor: 'transparent',
      barGap: 2,
      barRadius: 2,
      barWidth: 2,
      peaks: [[0, 0]],
      duration: 1,
    });
    wsRef.current = ws;
    setIsWsReady(true);
    ws.on('play', () => setIsWsPlaying(true));
    ws.on('pause', () => setIsWsPlaying(false));
    ws.on('finish', () => setIsWsPlaying(false));
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, []);

  // Streaming phase: render the growing waveform from accumulated peaks.
  // `setOptions({ peaks })` does NOT re-decode — only `load(url, peaks, duration)`
  // updates the rendered waveform — so push fresh peaks through `load('')` with
  // no fetch (channel data is supplied).
  //
  // To make it grow left→right toward the full length (instead of always filling
  // the width and rescaling), pad the real peaks with silence up to the expected
  // total duration. After each load, `setTime(played)` colours the streamed
  // portion with the progress colour. Throttled with an in-flight guard.
  useEffect(() => {
    if (phase !== 'streaming' || !isWsReady) return;
    let raf = 0;
    let lastUpdate = 0;
    let loading = false;
    const loop = (now: number) => {
      const ws = wsRef.current;
      if (ws && !(loading || handedOffRef.current) && now - lastUpdate > 150) {
        const peaks = getPeaks();
        const generated = getDuration();
        if (peaks.length > 0 && generated > 0) {
          const total = Math.max(estimatedDurationSec, generated);
          const binsPerSec = peaks.length / generated;
          const targetBins = Math.ceil(total * binsPerSec);
          const padded =
            targetBins > peaks.length
              ? peaks.concat(new Array(targetBins - peaks.length).fill(0))
              : peaks;
          const played = Math.min(getCurrentTime(), total);
          lastUpdate = now;
          loading = true;
          ws.load('', [padded], total)
            .then(() => ws.setTime(played))
            .catch(() => undefined)
            .finally(() => {
              loading = false;
            });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [
    phase,
    isWsReady,
    estimatedDurationSec,
    getPeaks,
    getDuration,
    getCurrentTime,
  ]);

  // File phase: hand off to the assembled WAV blob on the same instance.
  useEffect(() => {
    if (phase !== 'file' || !(isWsReady && wavBlob) || loadedFileRef.current) {
      return;
    }
    const ws = wsRef.current;
    if (!ws) return;
    loadedFileRef.current = true;
    handedOffRef.current = true;
    // Load the assembled WAV WITHOUT precomputed peaks: passing channel data
    // makes wavesurfer render from peaks and skip loading the blob into its
    // media element, leaving the waveform un-seekable and un-playable. A plain
    // `loadBlob(blob)` decodes the (small, local) clip, wires up real seekable
    // media, and renders the exact waveform — behaving like a normal file.
    // Then resume from the position the live engine reached so playback is
    // continuous and seekable from that point on.
    const { time, wasPlaying } = getHandoff();
    ws.loadBlob(wavBlob)
      .then(() => {
        if (time > 0) {
          ws.setTime(time);
        }
        if (wasPlaying) {
          attemptPlayback(
            () => ws.play(),
            () => setIsWsPlaying(false),
          ).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [phase, isWsReady, wavBlob, getHandoff]);

  // Expose reset/stop to the parent (file-phase controls).
  useEffect(() => {
    if (!(onControlsReady && isWsReady)) return;
    onControlsReady({
      reset: () => {
        wsRef.current?.stop();
        wsRef.current?.seekTo(0);
      },
      stop: () => wsRef.current?.stop(),
    });
  }, [onControlsReady, isWsReady]);

  const handlePlay = useCallback(() => {
    if (phase === 'file') {
      const ws = wsRef.current;
      if (!ws) return;
      if (ws.isPlaying()) {
        ws.pause();
      } else {
        attemptPlayback(
          () => ws.play(),
          () => setIsWsPlaying(false),
        ).catch(() => undefined);
      }
      return;
    }
    controller.togglePlayPause();
  }, [phase, controller]);

  const isPlaying = phase === 'file' ? isWsPlaying : isLivePlaying;

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <Button
        className={cn(
          'min-h-10 min-w-10 shrink-0 rounded-full',
          buttonClassName,
        )}
        onClick={handlePlay}
        size="icon"
        title={playAudioTitle}
        variant="secondary"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <div className={cn('w-32 flex-1', waveformClassName)}>
        <div ref={containerRef} />
      </div>
    </div>
  );
}
