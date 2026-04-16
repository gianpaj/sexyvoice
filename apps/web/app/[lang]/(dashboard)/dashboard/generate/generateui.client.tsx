'use client';

import { useMemo, useState } from 'react';

import { AudioGenerator } from '@/components/audio-generator';
import { VoiceSelector } from '@/components/voice-selector';
import { getFeaturedVoice } from '@/lib/voices';
import type messages from '@/messages/en.json';
import { AudioProvider } from '../clone/audio-provider';

interface GenerateUIProps {
  dict: (typeof messages)['generate'];
  hasEnoughCredits: boolean;
  isPaidUser: boolean;
  publicVoices: Tables<'voices'>[];
}

const STYLE_PROMPT_VARIANT_MOAN =
  process.env.NEXT_PUBLIC_STYLE_PROMPT_VARIANT_MOAN;

export function GenerateUI({
  publicVoices,
  hasEnoughCredits,
  isPaidUser,
  dict,
}: GenerateUIProps) {
  const initialVoiceName = useMemo(
    () =>
      getFeaturedVoice(publicVoices)?.name || publicVoices[0]?.name || 'zephyr',
    [publicVoices],
  );
  const [selectedVoice, setSelectedVoice] = useState(initialVoiceName);
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PROMPT_VARIANT_MOAN);
  const [useNewModel, setUseNewModel] = useState(false);
  const selectedVoiceSample = publicVoices.find(
    (file) => file.name === selectedVoice,
  );
  const isGeminiVoice = selectedVoiceSample?.model === 'gpro';
  return (
    <div className="flex flex-col gap-6">
      <VoiceSelector
        dict={dict}
        publicVoices={publicVoices}
        selectedStyle={isGeminiVoice ? selectedStyle : undefined}
        selectedVoice={selectedVoiceSample}
        setSelectedStyle={setSelectedStyle}
        setSelectedVoice={setSelectedVoice}
        useNewModel={isGeminiVoice ? useNewModel : undefined}
        setUseNewModel={setUseNewModel}
      />
      <AudioProvider>
        <AudioGenerator
          dict={dict}
          hasEnoughCredits={hasEnoughCredits}
          isPaidUser={isPaidUser}
          selectedStyle={isGeminiVoice ? selectedStyle : undefined}
          selectedVoice={selectedVoiceSample}
          useNewModel={isGeminiVoice ? useNewModel : undefined}
        />
      </AudioProvider>
    </div>
  );
}
