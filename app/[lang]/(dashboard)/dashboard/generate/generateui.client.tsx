'use client';

import { useState } from 'react';
import { AudioGenerator } from '@/components/audio-generator';
import { VoiceSelector } from '@/components/voice-selector';

export const GenerateUI = ({ publicVoices }: { publicVoices: Voice[] }) => {
  const [selectedVoice, setSelectedVoice] = useState<string>('tara');
  return (
    <div className="flex flex-col gap-6">
      <VoiceSelector
        setSelectedVoice={setSelectedVoice}
        selectedVoice={selectedVoice}
        // userVoices={[]}
        publicVoices={publicVoices}
      />
      <AudioGenerator selectedVoice={selectedVoice} />
    </div>
  );
};
