'use client';

import { useState } from 'react';

import { AudioGenerator } from '@/components/audio-generator';
import { VoiceSelector } from '@/components/voice-selector';
import type lang from '@/lib/i18n/dictionaries/en.json';

interface GenerateUIProps {
  publicVoices: Voice[];
  hasEnoughCredits: boolean;
  dict: (typeof lang)['generate'];
}

const STYLE_PROMPT_VARIANT_MOAN =
  process.env.NEXT_PUBLIC_STYLE_PROMPT_VARIANT_MOAN;

export function GenerateUI({
  publicVoices,
  hasEnoughCredits,
  dict,
}: GenerateUIProps) {
  const [selectedVoice, setSelectedVoice] = useState('tara');
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PROMPT_VARIANT_MOAN);
  const selectedVoiceSample = publicVoices.find(
    (file) => file.name === selectedVoice,
  );
  return (
    <div className="flex flex-col gap-6">
      <VoiceSelector
        setSelectedVoice={setSelectedVoice}
        selectedVoice={selectedVoiceSample}
        selectedStyle={selectedStyle}
        setSelectedStyle={setSelectedStyle}
        publicVoices={publicVoices}
      />
      <AudioGenerator
        selectedVoice={selectedVoiceSample}
        selectedStyle={selectedStyle}
        hasEnoughCredits={hasEnoughCredits}
        dict={dict}
      />
    </div>
  );
}
