'use client';

import { useState } from 'react';
import { AudioGenerator } from '@/components/audio-generator';
import { VoiceSelector } from '@/components/voice-selector';

interface GenerateUIProps {
  publicVoices: Voice[];
  hasEnoughCredits: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  dict: any;
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
