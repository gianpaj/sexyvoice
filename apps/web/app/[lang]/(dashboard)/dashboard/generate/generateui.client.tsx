'use client';

import { useState } from 'react';

import { AudioGenerator } from '@/components/audio-generator';
import { AudioProvider } from '@/components/audio-provider';
import { GenerationSettingsPanel } from '@/components/generation-settings-panel';
import { VoiceSelector } from '@/components/voice-selector';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import { getTtsProvider } from '@/lib/utils';
import { getFeaturedVoice } from '@/lib/voices';

interface GenerateUIProps {
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
}: GenerateUIProps) {
  const initialVoiceId =
    getFeaturedVoice(publicVoices)?.id || publicVoices[0]?.id || '';
  const [selectedVoice, setSelectedVoice] = useState(initialVoiceId);
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PROMPT_VARIANT_MOAN);
  const { settings, updateSettings, resetSettings } = useGenerationSettings();
  const selectedVoiceSample = publicVoices.find(
    (file) => file.id === selectedVoice,
  );
  const isGeminiVoice = getTtsProvider(selectedVoiceSample?.model) === 'gemini';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <GenerationSettingsPanel
          isPaidUser={isPaidUser}
          resetSettings={resetSettings}
          selectedVoice={selectedVoiceSample}
          settings={settings}
          updateSettings={updateSettings}
        />
      </div>
      <VoiceSelector
        isPaidUser={isPaidUser}
        publicVoices={publicVoices}
        selectedStyle={isGeminiVoice ? selectedStyle : undefined}
        selectedVoice={selectedVoiceSample}
        setSelectedStyle={setSelectedStyle}
        setSelectedVoice={setSelectedVoice}
      />
      <AudioProvider>
        <AudioGenerator
          hasEnoughCredits={hasEnoughCredits}
          isPaidUser={isPaidUser}
          selectedStyle={isGeminiVoice ? selectedStyle : undefined}
          selectedVoice={selectedVoiceSample}
          settings={settings}
        />
      </AudioProvider>
    </div>
  );
}
