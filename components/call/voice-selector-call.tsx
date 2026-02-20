'use client';

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DBVoice } from '@/data/voices';
import { useConnection } from '@/hooks/use-connection';
import {
  type ConfigurationFormFieldProps,
  ConfigurationFormSchema,
} from './configuration-form';
import { VoicePlayButton } from './voice-play-button';

// import { VoicesShowcase } from './voices-showcase';

interface VoiceSelectorProps extends ConfigurationFormFieldProps {
  callVoices?: DBVoice[];
}

export function VoiceSelector({ form, callVoices = [] }: VoiceSelectorProps) {
  const { dict } = useConnection();
  const currentVoiceName = form.watch('voice');
  const selectedVoice = callVoices.find((v) => v.name === currentVoiceName);

  return (
    <FormField
      control={form.control}
      name="voice"
      render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between space-y-0 px-1">
          <div className="flex items-center gap-2">
            <FormLabel className="font-medium text-fg1 text-sm">
              {dict.voiceSelectorLabel}
            </FormLabel>
            {/*<VoicesShowcase
              currentVoice={field.value}
              callVoices={callVoices}
              onSelectVoice={(voiceName) => {
                if (
                  ConfigurationFormSchema.shape.voice.safeParse(voiceName).success
                ) {
                  field.onChange(voiceName);
                }
              }}
            />*/}
          </div>
          <div className="flex items-center gap-2">
            <Select
              aria-label={dict.voiceSelectorLabel}
              defaultValue={form.formState.defaultValues!.voice!}
              onValueChange={(v) => {
                if (ConfigurationFormSchema.shape.voice.safeParse(v).success) {
                  field.onChange(v);
                }
              }}
              value={field.value}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={dict.voiceSelectorPlaceholder} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {callVoices.map((voice) => (
                  <SelectItem
                    key={`select-item-voice-${voice.id}`}
                    value={voice.name}
                  >
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <VoicePlayButton
              sampleUrl={selectedVoice?.sample_url ?? null}
              size="sm"
              variant="button"
              voiceName={currentVoiceName}
            />
          </div>
        </FormItem>
      )}
    />
  );
}
