'use client';

import { Pause, Play } from 'lucide-react';

import { useAudio } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AudioPlayerWithContext({
  url,
  className,
  playAudioTitle,
}: {
  url: string;
  className?: string;
  playAudioTitle: string;
}) {
  const audio = useAudio();
  const isPlaying = audio?.isPlaying && audio?.url === url;

  const handlePlay = () => {
    if (!audio) {
      return;
    }
    if (audio.url !== url) {
      audio.setUrlAndPlay(url);
      return;
    }

    if (audio?.isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  return (
    <Button
      className={cn('min-h-10 min-w-10 rounded-full', className)}
      disabled={!audio}
      onClick={handlePlay}
      size="icon"
      title={playAudioTitle}
      variant="secondary"
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}
