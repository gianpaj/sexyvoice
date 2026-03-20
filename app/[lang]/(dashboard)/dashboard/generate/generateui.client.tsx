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
  locale: string;
  publicVoices: Tables<'voices'>[];
}

const STYLE_PROMPT_VARIANT_MOAN =
  process.env.NEXT_PUBLIC_STYLE_PROMPT_VARIANT_MOAN;
const DEFAULT_GROK_CODEC = 'mp3';

export function GenerateUI({
  publicVoices,
  hasEnoughCredits,
  isPaidUser,
  dict,
  locale,
}: GenerateUIProps) {
  const initialVoiceName = useMemo(
    () =>
      getFeaturedVoice(publicVoices)?.name || publicVoices[0]?.name || 'zephyr',
    [publicVoices],
  );
  const [selectedVoice, setSelectedVoice] = useState(initialVoiceName);
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PROMPT_VARIANT_MOAN);
  const [selectedGrokCodec, setSelectedGrokCodec] =
    useState(DEFAULT_GROK_CODEC);
  const selectedVoiceSample = publicVoices.find(
    (file) => file.name === selectedVoice,
  );
  const isGeminiVoice = selectedVoiceSample?.model === 'gpro';
  const isGrokVoice = selectedVoiceSample?.model === 'grok';
  return (
    <div className="flex flex-col gap-6">
      <VoiceSelector
        dict={dict}
        publicVoices={publicVoices}
        selectedStyle={isGeminiVoice ? selectedStyle : undefined}
        selectedVoice={selectedVoiceSample}
        setSelectedStyle={setSelectedStyle}
        setSelectedVoice={setSelectedVoice}
      />
      <AudioProvider>
        <AudioGenerator
          dict={dict}
          hasEnoughCredits={hasEnoughCredits}
          isPaidUser={isPaidUser}
          selectedGrokCodec={isGrokVoice ? selectedGrokCodec : undefined}
          selectedStyle={isGeminiVoice ? selectedStyle : undefined}
          selectedVoice={selectedVoiceSample}
        />
      </AudioProvider>
    </div>
  );
}
