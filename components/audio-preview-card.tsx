'use client';

import { Pause, Play } from 'lucide-react';
import { useState } from 'react';

import { Button } from './ui/button';

// AudioPreviewCard component
export function AudioPreviewCard({
  name,
  prompt,
  audioSrc,
}: {
  name: string;
  prompt: string;
  audioSrc: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  const togglePlay = () => {
    if (isPlaying) {
      // Pause the current audio
      if (audioElement) {
        audioElement.pause();
      }
      setIsPlaying(false);
    } else {
      // Stop any existing audio first
      audioElement?.pause();

      // Create new audio element
      const audio = new Audio(audioSrc);
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
      });

      // Play and store the reference
      audio.play();
      setAudioElement(audio);
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex flex-col rounded-xl bg-white/10 p-6 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-lg text-white">{name}</h3>
        <Button
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlay}
          variant="outline"
          size="icon"
          className="!text-blue-400 border-none bg-blue-600/20 hover:bg-blue-600/40"
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>
      </div>
      <div className="grow whitespace-break-spaces rounded bg-gray-800/60 p-3 text-gray-200 text-sm">
        {prompt}
      </div>
    </div>
  );
}
