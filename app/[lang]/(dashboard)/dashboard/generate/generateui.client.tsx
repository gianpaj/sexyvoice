'use client';

import { useState } from 'react';

import { AudioGenerator } from '@/components/audio-generator';
import { VoiceSelector } from '@/components/voice-selector';
import type lang from '@/lib/i18n/dictionaries/en.json';

interface GenerateUIProps {
  publicVoices: Voice[];
  hasEnoughCredits: boolean;
  dict: (typeof lang);
}

export function GenerateUI({
  publicVoices,
  hasEnoughCredits,
  dict,
}: GenerateUIProps) {
  const [selectedVoice, setSelectedVoice] = useState('tara');

  return (
    <div className="flex flex-col gap-6">
      <VoiceSelector
        setSelectedVoice={setSelectedVoice}
        selectedVoice={selectedVoice}
        publicVoices={publicVoices}
      />
      <AudioGenerator
        selectedVoice={selectedVoice}
        hasEnoughCredits={hasEnoughCredits}
        dict={dict}
      />
    </div>
  );
}
