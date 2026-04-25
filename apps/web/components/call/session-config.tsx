'use client';

// import { VoiceSelector } from '@/components/call/voice-selector-call';
// import { VoiceSelectorForm } from '@/components/call/voice-selector-form';
import type { ConfigurationFormFieldProps } from './configuration-form';
// import { TemperatureSelector } from "./temperature-selector";
// import { MaxOutputTokensSelector } from "./max-output-tokens-selector";
// import { GrokImageToggle } from './grok-image-toggle';
// import { ModelSelector } from "./model-selector";

export function SessionConfig({ form }: ConfigurationFormFieldProps) {
  return (
    <div className="w-1/3">
      {/*<ModelSelector form={form} />*/}
      {/*<VoiceSelector form={form} />*/}
      {/*<TemperatureSelector form={form} />*/}
      {/*<MaxOutputTokensSelector form={form} />*/}
      {/*<GrokImageToggle form={form} />*/}
    </div>
  );
}
