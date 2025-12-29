'use client';

import { useEffect, useRef, useState } from 'react';

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
import { type VoiceId, voices, voicesData } from '@/data/voices';
import { Button } from '../ui/button';
import {
  type ConfigurationFormFieldProps,
  ConfigurationFormSchema,
} from './configuration-form';

// import { VoicesShowcase } from './voices-showcase';

function VoicePlayButton({ voiceId }: { voiceId: VoiceId }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voice = voicesData[voiceId];

  const handlePlay = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!audioRef.current) {
      audioRef.current = new Audio(voice.audioSampleUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      // Update src in case voice changed
      audioRef.current.src = voice.audioSampleUrl;
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  // Cleanup on unmount or voice change
  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    },
    [],
  );

  // Stop playing when voice changes
  useEffect(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isPlaying]);

  return (
    <Button
      aria-label={isPlaying ? 'Stop voice sample' : 'Play voice sample'}
      className="min-h-8 min-w-8"
      onClick={handlePlay}
      size="icon"
      title={`Preview ${voice.name}'s voice`}
      variant="outline"
    >
      {isPlaying ? (
        <svg
          aria-hidden="true"
          className="text-fg1"
          fill="currentColor"
          height="12"
          viewBox="0 0 14 14"
          width="12"
        >
          <rect height="10" rx="0.5" width="3" x="3" y="2" />
          <rect height="10" rx="0.5" width="3" x="8" y="2" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className="text-fg1"
          fill="currentColor"
          height="12"
          viewBox="0 0 14 14"
          width="12"
        >
          <path d="M3 2.5v9a.5.5 0 00.75.43l7.5-4.5a.5.5 0 000-.86l-7.5-4.5A.5.5 0 003 2.5z" />
        </svg>
      )}
    </Button>
  );
}

export function VoiceSelector({ form }: ConfigurationFormFieldProps) {
  return (
    <FormField
      control={form.control}
      name="voice"
      render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between space-y-0 px-1">
          <div className="flex items-center gap-2">
            <FormLabel className="font-medium text-fg1 text-sm">
              Voice
            </FormLabel>
            {/*<VoicesShowcase
              currentVoice={field.value}
              onSelectVoice={(voiceId) => {
                if (
                  ConfigurationFormSchema.shape.voice.safeParse(voiceId).success
                ) {
                  field.onChange(voiceId);
                }
              }}
            />*/}
          </div>
          <div className="flex items-center gap-2">
            <Select
              aria-label="Voice"
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
                  <SelectValue placeholder="Choose voice" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem
                    key={`select-item-voice-${voice.id}`}
                    value={voice.id}
                  >
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <VoicePlayButton voiceId={field.value as VoiceId} />
          </div>
        </FormItem>
      )}
    />
  );
}
