'use client';

import { useState } from 'react';

import { AudioGenerator } from '@/components/audio-generator';
import { AudioProvider } from '@/components/audio-provider';
import { GenerationSettingsPanel } from '@/components/generation-settings-panel';
import { VoiceSettingsCard } from '@/components/voice-settings-card';
import { useGenerationSettings } from '@/hooks/use-generation-settings';
import { getTtsProvider } from '@/lib/utils';
import { compareVoices, getFeaturedVoice } from '@/lib/voices';

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
  // One order for the picker and the default voice; see compareVoices.
  const voices = [...publicVoices].sort(compareVoices);
  const initialVoiceId = getFeaturedVoice(voices)?.id || voices[0]?.id || '';
  const [selectedVoice, setSelectedVoice] = useState(initialVoiceId);
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PROMPT_VARIANT_MOAN);
  const { settings, updateSettings, resetSettings } = useGenerationSettings();
  const selectedVoiceSample = voices.find((file) => file.id === selectedVoice);
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
      <VoiceSettingsCard
        isPaidUser={isPaidUser}
        publicVoices={voices}
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
