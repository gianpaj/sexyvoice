'use client';

import { Pause, Play } from 'lucide-react';

import { useAudio } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AudioPlayerWithContext({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const audio = useAudio();
  const isPlaying = audio?.currentPlayingUrl === url;

  const handlePlay = () => {
    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pauseSong();
    } else {
      audio.setSong(url);
    }
  };

  return (
    <Button
      className={cn('min-h-10 min-w-10 rounded-full', className)}
      disabled={!audio}
      onClick={handlePlay}
      size="icon"
      variant="secondary"
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}
