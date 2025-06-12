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

export function GenerateUI({
  publicVoices,
  hasEnoughCredits,
  dict,
}: GenerateUIProps) {
  const [selectedVoice, setSelectedVoice] = useState('tara');
  const selectedVoiceSample = publicVoices.find(
    (file) => file.name === selectedVoice,
  );
  return (
    <div className="flex flex-col gap-6">
      <VoiceSelector
        setSelectedVoice={setSelectedVoice}
        selectedVoice={selectedVoiceSample}
        publicVoices={publicVoices}
      />
      <AudioGenerator
        selectedVoice={selectedVoiceSample}
        hasEnoughCredits={hasEnoughCredits}
        dict={dict}
      />
    </div>
  );
}
