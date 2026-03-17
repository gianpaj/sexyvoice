'use client';

import { Pause, Play, Volume2 } from 'lucide-react';
import { useState } from 'react';

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

  const togglePlay = () => {
    if (isPlaying) {
      if (audioElement) {
        audioElement.pause();
      }
      setIsPlaying(false);
    } else {
      audioElement?.pause();

      const audio = new Audio(audioSrc);
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
      });

      audio.play();
      setAudioElement(audio);
      setIsPlaying(true);
    }
  };

  return (
    <article className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-linear-to-b from-white/[0.07] to-white/3 shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_28px_80px_rgba(0,0,0,0.34)]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-white/25 to-transparent" />
      <div className="pointer-events-none absolute -right-10 -bottom-10 size-32 rounded-full bg-brand-purple/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-8 top-8 size-24 rounded-full bg-brand-red/10 blur-3xl" />

      <div className="relative flex flex-col p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-white/45 text-[10px] uppercase tracking-[0.25em]">
              <Volume2 aria-hidden className="size-3.5 text-brand-red" />
              Voice sample
            </div>
            <h3 className="text-balance font-semibold text-white text-xl leading-8">
              {name}
            </h3>
          </div>

          <Button
            aria-label={isPlaying ? 'Pause sample' : 'Play sample'}
            className="hit-area-2 size-11 shrink-0 rounded-full border border-brand-red/20 bg-brand-red/10 text-brand-red transition-all duration-300 hover:border-brand-red/30 hover:bg-brand-red/20 hover:text-white"
            onClick={togglePlay}
            size="icon"
            variant="outline"
          >
            <span className="relative block size-4">
              <Pause
                className={`absolute inset-0 size-4 transition-all duration-300 ease-out ${
                  isPlaying
                    ? 'scale-100 rotate-0 opacity-100'
                    : 'scale-75 -rotate-90 opacity-0'
                }`}
              />
              <Play
                className={`absolute inset-0 size-4 transition-all duration-300 ease-out ${
                  isPlaying
                    ? 'ml-0 scale-75 rotate-90 opacity-0'
                    : 'ml-0.5 scale-100 rotate-0 opacity-100'
                }`}
              />
            </span>
          </Button>
        </div>

        <div
          className="line-clamp-6 whitespace-break-spaces rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-white/78"
          dir={dir}
          lang={lang}
          title={prompt}
        >
          {prompt}
        </div>
      </div>
    </article>
  );
}
