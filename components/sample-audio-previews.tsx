'use client';

import {
  Headphones,
  MoveRight,
  Sparkles,
  Volume2,
  Waves,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  getClientLocale,
  getSampleAudiosByLanguage,
  type SampleAudio,
} from '@/app/sample-audio';
import { AudioPreviewCard } from '@/components/audio-preview-card';

interface SampleAudioPreviewsProps {
  initialAudios: SampleAudio[];
  trySamplesSubtitle: string;
  trySamplesTitle: string;
}

export function SampleAudioPreviews({
  initialAudios,
  trySamplesTitle,
  trySamplesSubtitle,
}: SampleAudioPreviewsProps) {
  const [audios, setAudios] = useState<SampleAudio[]>(initialAudios);

  useEffect(() => {
    // Get client-side locale and re-sort audios if different from server
    const clientLocale = getClientLocale();
    if (clientLocale) {
      const sortedAudios = getSampleAudiosByLanguage(clientLocale);
      setAudios(sortedAudios);
    }
  }, []);

  return (
    <section
      aria-labelledby="sample-audio-previews-title"
      className="mx-auto mb-24 max-w-6xl md:pb-24"
    >
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-linear-to-br from-[#101522] via-[#111827] to-[#1a1326] px-6 py-8 shadow-[0_30px_120px_rgba(0,0,0,0.42)] backdrop-blur-sm md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.14),transparent_32%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
        <div className="-left-16 absolute top-0 h-44 w-44 rounded-full bg-brand-red/12 blur-3xl" />
        <div className="-right-10 absolute bottom-0 h-48 w-48 rounded-full bg-brand-purple/14 blur-3xl" />

        <div className="relative mb-10 grid gap-6 border-white/10 border-b pb-8 md:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)] md:items-end">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-white/60 text-xs uppercase tracking-[0.28em]">
              <Headphones aria-hidden className="size-3.5 text-brand-red" />
              Premium voice showcase
            </div>
            <h2
              className="text-balance font-bold text-3xl text-white md:text-5xl"
              id="sample-audio-previews-title"
            >
              {trySamplesTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/72 md:text-lg">
              {trySamplesSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:w-fit md:ml-auto">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="mb-2 flex items-center gap-2 text-white/45 text-xs uppercase tracking-[0.24em]">
                <Volume2 aria-hidden className="size-3.5 text-brand-red" />
                Samples
              </div>
              <p className="font-semibold text-2xl text-white tabular-nums">
                {audios.length}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="mb-2 flex items-center gap-2 text-white/45 text-xs uppercase tracking-[0.24em]">
                <Sparkles aria-hidden className="size-3.5 text-brand-red" />
                Curation
              </div>
              <p className="font-semibold text-xl text-white">Editorial</p>
            </div>
          </div>
        </div>

        <div className="relative mb-8 flex flex-wrap items-center gap-3 text-white/55 text-xs uppercase tracking-[0.24em]">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
            <Waves aria-hidden className="size-3.5 text-brand-red" />
            Natural rhythm
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
            <MoveRight aria-hidden className="size-3.5 text-brand-red" />
            Instant preview
          </span>
        </div>

        <div className="relative grid gap-6 md:grid-cols-2">
          {audios.map((audio) => (
            <AudioPreviewCard
              audioSrc={`https://files.sexyvoice.ai/${audio.audioSrc}`}
              dir={audio.dir}
              key={audio.id}
              lang={audio.lang}
              name={audio.name}
              prompt={audio.prompt}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
