'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AudioPlayer({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      audioRef.current?.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    // Initialize audio element
    audioRef.current = new Audio(url);

    const handleEnded = () => {
      setIsPlaying(false);
    };

    audioRef.current.addEventListener('ended', handleEnded);

    // Cleanup on unmount
    return () => {
      if (audioRef.current) {
        setIsPlaying(false);
        audioRef.current.pause();
        audioRef.current.removeEventListener('ended', handleEnded);
        audioRef.current.src = ''; // Release the resource
        audioRef.current = null;
      }
    };
  }, [url]);

  return (
    <Button
      className={cn('min-h-10 min-w-10 rounded-full', className)}
      onClick={handlePlay}
      size="icon"
      variant="secondary"
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}
