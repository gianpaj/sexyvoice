'use client';

import { Pause, Play } from 'lucide-react';
import { useState } from 'react';

import { attemptPlayback } from '@/lib/media-playback';
import { GrokTaggedText } from './grok-tagged-text';
import { Button } from './ui/button';

export function AudioPreviewCard({
  name,
  prompt,
  audioSrc,
  lang,
  dir,
}: {
  name: string;
  prompt: string;
  audioSrc: string;
  lang: string;
  dir: 'ltr' | 'rtl';
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  const togglePlay = async () => {
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
      setIsPlaying(true);
      setAudioElement(audio);
      await attemptPlayback(
        () => audio.play(),
        () => {
          setIsPlaying(false);
          setAudioElement(null);
        },
      );
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.07] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-lg text-white">{name}</h3>
        <Button
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="hit-area-2 border-none bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 hover:text-blue-200"
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
        className="line-clamp-5 whitespace-break-spaces rounded border-12 border-transparent bg-accent text-justify text-sm text-zinc-200"
        dir={dir}
        lang={lang}
        title={prompt}
      >
        <GrokTaggedText text={prompt} />
      </div>
    </div>
  );
}
