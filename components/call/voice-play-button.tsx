'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoicePlayButtonProps {
  voiceName: string;
  sampleUrl: string | null;
  /** Optional custom aria labels */
  ariaLabels?: {
    play: string;
    stop: string;
  };
  /** Optional custom title for tooltip */
  title?: string;
  /** Size variant - affects button and icon size */
  size?: 'sm' | 'md' | 'lg';
  /** Style variant */
  variant?: 'button' | 'outline' | 'ghost';
  /** Additional className for the button */
  className?: string;
  /** Enable hover prefetching for faster playback */
  prefetch?: boolean;
}

export function VoicePlayButton({
  voiceName,
  sampleUrl,
  ariaLabels,
  title,
  size = 'md',
  variant = 'outline',
  className,
  prefetch = true,
}: VoicePlayButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Prefetch audio on hover for faster playback
  const handleMouseEnter = () => {
    if (!(prefetch && sampleUrl) || audioRef.current) return;

    // Create and preload the audio element
    audioRef.current = new Audio(sampleUrl);
    audioRef.current.preload = 'auto';
    audioRef.current.onended = () => setIsPlaying(false);
    audioRef.current.onerror = () => setIsPlaying(false);
  };

  const handlePlay = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!sampleUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(sampleUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.src = sampleUrl;
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    },
    [],
  );

  // Stop playing and clear audio ref when voice or sampleUrl changes to allow prefetching new sample
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to stop when voiceName or sampleUrl changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null; // Clear ref to allow prefetching new voice
      setIsPlaying(false);
    }
  }, [voiceName, sampleUrl]);

  if (!sampleUrl) return null;

  const defaultAriaLabel = isPlaying
    ? 'Stop voice sample'
    : 'Play voice sample';
  const ariaLabel = ariaLabels
    ? isPlaying
      ? ariaLabels.stop
      : ariaLabels.play
    : defaultAriaLabel;

  const defaultTitle = `Preview ${voiceName}'s voice`;
  const buttonTitle = title || defaultTitle;

  // Size mappings
  const sizeClasses = {
    sm: 'h-7 w-7',
    md: 'h-8 w-8',
    lg: 'h-9 w-9',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  if (variant === 'button') {
    // Use Button component for shadcn/ui styled button
    return (
      <Button
        aria-label={ariaLabel}
        className={cn('shrink-0', sizeClasses[size], className)}
        onClick={handlePlay}
        onMouseEnter={prefetch ? handleMouseEnter : undefined}
        size="icon"
        title={buttonTitle}
        type="button"
        variant="outline"
      >
        {isPlaying ? (
          <Pause className={iconSizes[size]} />
        ) : (
          <Play className={iconSizes[size]} />
        )}
      </Button>
    );
  }

  // Use native button for more customization
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground',
        sizeClasses[size],
        className,
      )}
      onClick={handlePlay}
      onMouseEnter={prefetch ? handleMouseEnter : undefined}
      title={buttonTitle}
      type="button"
    >
      {isPlaying ? (
        <Pause className={iconSizes[size]} />
      ) : (
        <Play className={iconSizes[size]} />
      )}
    </button>
  );
}
