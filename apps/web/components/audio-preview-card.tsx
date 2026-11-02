'use client';

import { Pause, Play } from 'lucide-react';
import { useState } from 'react';

import { IconSwap } from '@/components/motion-primitives/icon-swap';
import { attemptPlayback } from '@/lib/media-playback';
import { GrokTaggedText } from './grok-tagged-text';
import { Button } from './ui/button';

const PROMPT_TAG_CLASS =
  'inline-flex rounded bg-fuchsia-400/15 px-1 py-0.5 font-mono text-fuchsia-200 text-xs';

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
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/3 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-lg text-white">{name}</h3>
        <Button
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="hit-area-2 border-none bg-fuchsia-500/15 text-fuchsia-300 hover:bg-fuchsia-500/30 hover:text-fuchsia-100"
          onClick={togglePlay}
          size="icon"
          variant="outline"
        >
          <IconSwap swapKey={isPlaying ? 'pause' : 'play'}>
            {isPlaying ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </IconSwap>
        </Button>
      </div>
      <div
        className="line-clamp-5 whitespace-break-spaces text-pretty rounded border-12 border-transparent bg-black/25 text-sm text-zinc-200"
        dir={dir}
        lang={lang}
        title={prompt}
      >
        <GrokTaggedText className={PROMPT_TAG_CLASS} text={prompt} />
      </div>
    </div>
  );
}
