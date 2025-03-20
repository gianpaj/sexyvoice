'use client';

import { useState } from 'react';
import { Play, Pause } from 'lucide-react';

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
    if (!isPlaying) {
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
    } else {
      // Pause the current audio
      if (audioElement) {
        audioElement.pause();
      }
      setIsPlaying(false);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{name}</h3>
        <Button
          onClick={togglePlay}
          variant="outline"
          size="icon"
          className="bg-blue-600/20 border-none hover:bg-blue-600/40 !text-blue-400"
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>
      </div>
      <div className="bg-gray-800/60 rounded p-3 text-sm text-gray-300 grow">
        {prompt}
      </div>
    </div>
  );
}
