'use client';

import { Pause, Play } from 'lucide-react';
import { useState } from 'react';

import { Button } from './ui/button';

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
          className="!text-blue-400 border-none bg-blue-600/20 hover:bg-blue-600/40"
          onClick={togglePlay}
          size="icon"
          variant="outline"
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>
      </div>
      <div
        className="line-clamp-5 grow whitespace-break-spaces rounded border-[#1b2432] border-[12px] bg-[#1b2432] text-gray-200 text-sm"
        title={prompt}
      >
        {prompt}
      </div>
    </div>
  );
}
