'use client';

// import { VoiceSelectorForm } from '@/components/call/voice-selector-form';
import type { ConfigurationFormFieldProps } from './configuration-form.schema';
// import { TemperatureSelector } from "./temperature-selector";
// import { MaxOutputTokensSelector } from "./max-output-tokens-selector";
// import { ModelSelector } from "./model-selector";

export function SessionConfig(_props: ConfigurationFormFieldProps) {
  return (
    <div className="w-1/3">
      {/*<ModelSelector form={form} />*/}
      {/*<TemperatureSelector form={form} />*/}
      {/*<MaxOutputTokensSelector form={form} />*/}
    </div>
  );
}
