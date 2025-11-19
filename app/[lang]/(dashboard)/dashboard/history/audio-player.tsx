'use client';

import { Pause, Play } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function AudioPlayer({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const handlePlay = () => {
    if (isPlaying) {
      audio?.pause();
      setIsPlaying(false);
    } else {
      const newAudio = new Audio(url);
      newAudio.addEventListener('ended', () => {
        setIsPlaying(false);
      });
      newAudio.play();
      setAudio(newAudio);
      setIsPlaying(true);
    }
  };

  return (
    <Button
      variant="secondary"
      size="icon"
      className="min-h-10 min-w-10 rounded-full"
      onClick={handlePlay}
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}
