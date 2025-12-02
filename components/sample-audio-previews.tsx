'use client';

import { useEffect, useState } from 'react';

import { getClientLocale, getSampleAudiosByLanguage } from '@/app/sample-audio';
import { AudioPreviewCard } from '@/components/audio-preview-card';

interface SampleAudio {
  id: number;
  name: string;
  prompt: string;
  audioSrc: string;
}

interface SampleAudioPreviewsProps {
  initialAudios: SampleAudio[];
  trySamplesTitle: string;
  trySamplesSubtitle: string;
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
    <div className="mx-auto mb-16 max-w-4xl md:pb-16">
      <h2 className="mb-2 font-bold text-2xl text-white">{trySamplesTitle}</h2>
      <p className="mb-6 text-gray-200">{trySamplesSubtitle}</p>
      <div className="grid gap-6 md:grid-cols-2">
        {audios.map((audio) => (
          <AudioPreviewCard
            audioSrc={`https://files.sexyvoice.ai/${audio.audioSrc}`}
            key={audio.id}
            name={audio.name}
            prompt={audio.prompt}
          />
        ))}
      </div>
    </div>
  );
}
