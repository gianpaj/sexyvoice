'use client';

import { useState } from 'react';

import { AudioGenerator } from '@/components/audio-generator';
import { VoiceSelector } from '@/components/voice-selector';
import type lang from '@/lib/i18n/dictionaries/en.json';
import { AudioProvider } from '../clone/audio-provider';

type GenerateUIProps = {
  publicVoices: Voice[];
  hasEnoughCredits: boolean;
  dict: (typeof lang)['generate'];
  locale: string;
};

const STYLE_PROMPT_VARIANT_MOAN =
  process.env.NEXT_PUBLIC_STYLE_PROMPT_VARIANT_MOAN;

export function GenerateUI({
  publicVoices,
  hasEnoughCredits,
  dict,
  locale,
}: GenerateUIProps) {
  const [selectedVoice, setSelectedVoice] = useState('zephyr');
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PROMPT_VARIANT_MOAN);
  const selectedVoiceSample = publicVoices.find(
    (file) => file.name === selectedVoice,
  );
  return (
    <div className="flex flex-col gap-6">
      <VoiceSelector
        dict={dict}
        publicVoices={publicVoices}
        selectedStyle={selectedStyle}
        selectedVoice={selectedVoiceSample}
        setSelectedStyle={setSelectedStyle}
        setSelectedVoice={setSelectedVoice}
      />
      <AudioProvider>
        <AudioGenerator
          dict={dict}
          hasEnoughCredits={hasEnoughCredits}
          locale={locale}
          selectedStyle={selectedStyle}
          selectedVoice={selectedVoiceSample}
        />
      </AudioProvider>
    </div>
  );
}
