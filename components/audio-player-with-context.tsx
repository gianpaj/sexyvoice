'use client';

import WavesurferPlayer from '@wavesurfer/react';
import { Pause, Play } from 'lucide-react';
import { useCallback, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';

import { useAudio } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AudioPlayerWithContextProps {
  url: string;
  className?: string;
  buttonClassName?: string;
  waveformClassName?: string;
  playAudioTitle: string;
  showWaveform?: boolean;
  waveformHeight?: number;
  waveColor?: string;
  progressColor?: string;
}

export function AudioPlayerWithContext({
  url,
  className,
  buttonClassName,
  waveformClassName,
  playAudioTitle,
  showWaveform = false,
  waveformHeight = 48,
  waveColor = '#a1a1aa',
  progressColor = '#7c3aed',
}: AudioPlayerWithContextProps) {
  const audio = useAudio();

  // For non-waveform mode, use the shared audio context
  const isPlayingFromContext = audio?.isPlaying && audio?.url === url;

  // For waveform mode, track local playing state from wavesurfer events
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [isWaveformPlaying, setIsWaveformPlaying] = useState(false);

  // Determine which playing state to use based on mode
  const isPlaying = showWaveform ? isWaveformPlaying : isPlayingFromContext;

  const onReady = useCallback((ws: WaveSurfer) => {
    setWavesurfer(ws);
    setIsWaveformPlaying(false);
  }, []);

  const onPlay = useCallback(() => {
    setIsWaveformPlaying(true);
  }, []);

  const onPause = useCallback(() => {
    setIsWaveformPlaying(false);
  }, []);

  const handlePlayWithWaveform = useCallback(() => {
    wavesurfer?.playPause();
  }, [wavesurfer]);

  const handlePlayWithContext = useCallback(() => {
    if (!audio) return;
    if (audio.url !== url) {
      audio.setUrlAndPlay(url);
    } else if (audio.isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }, [audio, url]);

  const handlePlay = showWaveform
    ? handlePlayWithWaveform
    : handlePlayWithContext;

  // Render without waveform (original behavior)
  if (!showWaveform) {
    return (
      <Button
        className={cn('min-h-10 min-w-10 rounded-full', className)}
        disabled={!audio}
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
    );
  }

  // Render with waveform
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <Button
        className={cn(
          'min-h-10 min-w-10 shrink-0 rounded-full',
          buttonClassName,
        )}
        disabled={!wavesurfer}
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
        <WavesurferPlayer
          barGap={2}
          barRadius={2}
          barWidth={2}
          cursorColor="transparent"
          height={waveformHeight}
          onPause={onPause}
          onPlay={onPlay}
          onReady={onReady}
          progressColor={progressColor}
          url={url}
          waveColor={waveColor}
        />
      </div>
    </div>
  );
}
