'use client';

import { ScissorsLineDashed } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type langDict from '@/lib/i18n/dictionaries/en.json';
import { DropZone } from './components/drop-zone';
import { JoinControls } from './components/join-controls';
import { TrackList } from './components/track-list';
import {
  type JoinerOutputFormat,
  useFFmpegJoiner,
} from './hooks/use-ffmpeg-joiner';
import './audio-joiner.css';

interface TrackSegment {
  id: string;
  file: File;
  name: string;
  url: string;
  durationSec: number;
  startSec: number;
  endSec: number;
  decodedBuffer: AudioBuffer;
}

interface Props {
  dict: (typeof langDict)['audioJoiner'];
}

function formatTime(valueSec: number): string {
  const minutes = Math.floor(valueSec / 60);
  const seconds = Math.floor(valueSec % 60);
  const tenths = Math.floor((valueSec % 1) * 10);

  return `${minutes}:${`${seconds}`.padStart(2, '0')}.${tenths}`;
}

function isInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

function computeTotalDuration(tracks: TrackSegment[]): number {
  return tracks.reduce(
    (accumulator, track) => accumulator + (track.endSec - track.startSec),
    0,
  );
}

export default function AudioJoinerClient({ dict }: Props) {
  const [tracks, setTracks] = useState<TrackSegment[]>([]);
  const [outputFormat, setOutputFormat] = useState<JoinerOutputFormat>('mp3');
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const {
    ensureLoaded,
    join,
    cancel,
    isLoading,
    isProcessing,
    progress,
    error,
  } = useFFmpegJoiner();

  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playbackStartAtRef = useRef(0);
  const playbackOffsetRef = useRef(0);
  const tracksRef = useRef<TrackSegment[]>([]);

  useEffect(() => {
    ensureLoaded().catch((_err) => {
      toast.error(dict.errors.ffmpegLoadFailed);
    });
  }, [ensureLoaded, dict.errors.ffmpegLoadFailed]);

  const stopPlayback = useCallback((resetTime = false) => {
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch (_err) {
        // no-op: source may already be stopped
      }
    }

    playbackSourcesRef.current = [];
    setIsPlaying(false);

    if (resetTime) {
      playbackOffsetRef.current = 0;
      setCurrentTimeSec(0);
    }
  }, []);

  const totalDurationSec = useMemo(
    () => computeTotalDuration(tracks),
    [tracks],
  );

  const schedulePlayback = useCallback(
    async (startOffsetSec: number) => {
      if (tracks.length === 0 || totalDurationSec <= 0) {
        return;
      }

      const context =
        audioContextRef.current ||
        new window.AudioContext({ latencyHint: 'interactive' });
      audioContextRef.current = context;

      if (context.state === 'suspended') {
        await context.resume();
      }

      stopPlayback();

      let elapsedBeforeStart = 0;
      let scheduledOffsetSec = 0;

      for (const track of tracks) {
        const segmentDurationSec = track.endSec - track.startSec;

        if (segmentDurationSec <= 0) {
          continue;
        }

        if (elapsedBeforeStart + segmentDurationSec <= startOffsetSec) {
          elapsedBeforeStart += segmentDurationSec;
          continue;
        }

        const localSkipSec = Math.max(0, startOffsetSec - elapsedBeforeStart);
        const playDurationSec = segmentDurationSec - localSkipSec;

        if (playDurationSec <= 0) {
          elapsedBeforeStart += segmentDurationSec;
          continue;
        }

        const source = context.createBufferSource();
        source.buffer = track.decodedBuffer;
        source.connect(context.destination);
        source.start(
          context.currentTime + scheduledOffsetSec,
          track.startSec + localSkipSec,
          playDurationSec,
        );

        playbackSourcesRef.current.push(source);
        scheduledOffsetSec += playDurationSec;
        elapsedBeforeStart += segmentDurationSec;
      }

      playbackStartAtRef.current = context.currentTime - startOffsetSec;
      setIsPlaying(true);
    },
    [tracks, totalDurationSec, stopPlayback],
  );

  useEffect(() => {
    if (!(isPlaying && audioContextRef.current)) {
      return;
    }

    const tick = window.setInterval(() => {
      const context = audioContextRef.current;
      if (!context) {
        return;
      }

      const nextTime = Math.max(
        0,
        context.currentTime - playbackStartAtRef.current,
      );
      playbackOffsetRef.current = nextTime;
      setCurrentTimeSec(Math.min(nextTime, totalDurationSec));

      if (nextTime >= totalDurationSec) {
        stopPlayback(true);
      }
    }, 100);

    return () => {
      window.clearInterval(tick);
    };
  }, [isPlaying, totalDurationSec, stopPlayback]);

  const handleSeek = useCallback(
    async (globalTimeSec: number) => {
      const clamped = Math.max(0, Math.min(globalTimeSec, totalDurationSec));
      playbackOffsetRef.current = clamped;
      setCurrentTimeSec(clamped);

      if (isPlaying) {
        try {
          await schedulePlayback(clamped);
        } catch (_err) {
          toast.error(dict.errors.previewFailed);
        }
      } else {
        // Just stop any lingering sources without resetting the time.
        stopPlayback(false);
      }
    },
    [
      totalDurationSec,
      isPlaying,
      schedulePlayback,
      stopPlayback,
      dict.errors.previewFailed,
    ],
  );

  const handleTogglePlayPause = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    try {
      await schedulePlayback(playbackOffsetRef.current);
    } catch (_err) {
      toast.error(dict.errors.previewFailed);
    }
  }, [dict.errors.previewFailed, isPlaying, schedulePlayback, stopPlayback]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      if (isInteractiveElement(event.target)) {
        return;
      }

      event.preventDefault();
      handleTogglePlayPause().catch(() => undefined);
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [handleTogglePlayPause]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    return () => {
      for (const track of tracksRef.current) {
        URL.revokeObjectURL(track.url);
      }
      stopPlayback(true);
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, [stopPlayback]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      const context =
        audioContextRef.current ||
        new window.AudioContext({ latencyHint: 'interactive' });
      audioContextRef.current = context;

      const createdTracks: TrackSegment[] = [];

      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const decodedBuffer = await context.decodeAudioData(
            arrayBuffer.slice(0),
          );
          const durationSec = decodedBuffer.duration;

          createdTracks.push({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            url: URL.createObjectURL(file),
            durationSec,
            startSec: 0,
            endSec: durationSec,
            decodedBuffer,
          });
        } catch (_err) {
          toast.error(dict.errors.decodeFailed.replace('{file}', file.name));
        }
      }

      if (createdTracks.length > 0) {
        setTracks((current) => [...current, ...createdTracks]);
      }
    },
    [dict.errors.decodeFailed],
  );

  const updateTrack = useCallback(
    (
      trackId: string,
      updater: (track: TrackSegment) => TrackSegment,
      shouldResetPreview = true,
    ) => {
      setTracks((current) =>
        current.map((track) => (track.id === trackId ? updater(track) : track)),
      );

      if (shouldResetPreview) {
        stopPlayback(true);
      }
    },
    [stopPlayback],
  );

  const handleMoveUp = useCallback(
    (trackId: string) => {
      setTracks((current) => {
        const index = current.findIndex((track) => track.id === trackId);
        if (index <= 0) {
          return current;
        }

        const next = [...current];
        const [item] = next.splice(index, 1);
        next.splice(index - 1, 0, item);
        return next;
      });
      stopPlayback(true);
    },
    [stopPlayback],
  );

  const handleMoveDown = useCallback(
    (trackId: string) => {
      setTracks((current) => {
        const index = current.findIndex((track) => track.id === trackId);
        if (index === -1 || index >= current.length - 1) {
          return current;
        }

        const next = [...current];
        const [item] = next.splice(index, 1);
        next.splice(index + 1, 0, item);
        return next;
      });
      stopPlayback(true);
    },
    [stopPlayback],
  );

  const handleDelete = useCallback(
    (trackId: string) => {
      setTracks((current) => {
        const target = current.find((track) => track.id === trackId);
        if (target) {
          URL.revokeObjectURL(target.url);
        }

        return current.filter((track) => track.id !== trackId);
      });
      stopPlayback(true);
    },
    [stopPlayback],
  );

  const handleTrimChange = useCallback(
    (trackId: string, startSec: number, endSec: number) => {
      updateTrack(
        trackId,
        (track) => ({
          ...track,
          startSec,
          endSec,
        }),
        true,
      );
    },
    [updateTrack],
  );

  const handleDurationReady = useCallback(
    (trackId: string, durationSec: number) => {
      updateTrack(
        trackId,
        (track) => {
          if (track.durationSec === durationSec) {
            return track;
          }

          return {
            ...track,
            durationSec,
            startSec: Math.min(track.startSec, Math.max(0, durationSec - 0.05)),
            endSec: Math.min(track.endSec, durationSec),
          };
        },
        false,
      );
    },
    [updateTrack],
  );

  const handleJoin = useCallback(async () => {
    if (tracks.length === 0 || isProcessing) {
      return;
    }

    stopPlayback(true);

    try {
      const blob = await join(
        tracks.map((track) => ({
          file: track.file,
          startSec: track.startSec,
          endSec: track.endSec,
        })),
        outputFormat,
      );

      const outputUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = outputUrl;
      anchor.download = `joined-audio.${outputFormat}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(outputUrl), 150);
      toast.success(dict.success.downloadStarted);
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') {
        toast.info(dict.success.cancelled);
        return;
      }

      toast.error(dict.errors.joinFailed);
    }
  }, [tracks, isProcessing, stopPlayback, join, outputFormat, dict]);

  const handleCancel = useCallback(async () => {
    await cancel();
    toast.info(dict.success.cancelled);
  }, [cancel, dict.success.cancelled]);

  const canJoin = tracks.length > 0 && !isLoading && !isProcessing;

  return (
    <>
      <header className="mb-10 animate-fade-in text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <div className="gradient-bg flex h-12 w-12 items-center justify-center rounded-2xl shadow-glow">
            <ScissorsLineDashed className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="gradient-text font-extrabold text-3xl md:text-4xl">
            {dict.title}
          </h1>
        </div>
        <p className="text-muted-foreground text-sm md:text-base">
          {dict.subtitle}
        </p>
      </header>

      <main className="glass-card animate-fade-in rounded-3xl p-4 md:p-8">
        <div className="space-y-6">
          <TrackList
            currentTimeSec={currentTimeSec}
            disabled={isProcessing}
            onDelete={handleDelete}
            onDurationReady={handleDurationReady}
            onMoveDown={handleMoveDown}
            onMoveUp={handleMoveUp}
            onSeek={handleSeek}
            onTrimChange={handleTrimChange}
            tracks={tracks}
          />

          <DropZone
            addFilesLabel={dict.dropZone.addFiles}
            compact={tracks.length > 0}
            disabled={isProcessing}
            onFilesSelected={handleFilesSelected}
            subtitle={dict.dropZone.subtitle}
            title={dict.dropZone.title}
          />

          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>
              {formatTime(currentTimeSec)} / {formatTime(totalDurationSec)}
            </span>
            {isProcessing && (
              <span>
                {dict.progress.processing}: {Math.round(progress * 100)}%
              </span>
            )}
          </div>

          <JoinControls
            canJoin={canJoin}
            isPlaying={isPlaying}
            isProcessing={isProcessing}
            labels={dict.controls}
            onCancel={handleCancel}
            onJoin={handleJoin}
            onOutputFormatChange={setOutputFormat}
            onTogglePlayPause={handleTogglePlayPause}
            outputFormat={outputFormat}
          />
        </div>
      </main>
    </>
  );
}
