'use client';

import { VoiceSelector } from './voice-selector';
import { AudioGenerator } from './audio-generator';
import { useState } from 'react';

const publicVoices = [
  // {
  //   id: '0',
  //   language: 'en-US',
  //   is_public: true,
  //   name: 'example reference',
  //   voice: 'example_reference',
  //   accent: 'en-newest',
  // },
  {
    id: '1',
    language: 'en-US',
    is_public: true,
    name: 'Tara',
    voice: 'tara',
    accent: '',
  },
  {
    id: '2',
    language: 'en-US',
    is_public: true,
    name: 'Leah',
    voice: 'leah',
    accent: '',
  },
  {
    id: '3',
    language: 'en-US',
    is_public: true,
    name: 'Jess',
    voice: 'jess',
    accent: '',
  },
  {
    id: '4',
    language: 'en-US',
    is_public: true,
    name: 'Leo',
    voice: 'leo',
    accent: '',
  },
  {
    id: '5',
    language: 'en-US',
    is_public: true,
    name: 'Dan',
    voice: 'dan',
    accent: '',
  },
  {
    id: '6',
    language: 'en-US',
    is_public: true,
    name: 'Mia',
    voice: 'mia',
    accent: '',
  },
  {
    id: '7',
    language: 'en-US',
    is_public: true,
    name: 'Zac',
    voice: 'zac',
    accent: '',
  },
  {
    id: '8',
    language: 'en-US',
    is_public: true,
    name: 'Zoe',
    voice: 'zoe',
    accent: '',
  },
];

interface Props {
  credits: {
    amount: number;
  } | null;
}

export const GenerateUI = ({ credits }: Props) => {
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  return (
    <div className="flex flex-col gap-6">
      <VoiceSelector
        setSelectedVoice={setSelectedVoice}
        selectedVoice={selectedVoice}
        userVoices={[]}
        publicVoices={publicVoices || []}
      />
      <AudioGenerator
        selectedVoice={selectedVoice}
        credits={credits?.amount || 0}
      />
    </div>
  );
};
