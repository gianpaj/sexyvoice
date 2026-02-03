'use client';
import { Info } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import type { ConfigurationFormSchema } from '@/components/call/configuration-form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type VoiceId, voicesData } from '@/data/voices';
import { capitalizeFirstLetter } from '@/lib/utils';

export function VoiceSelectorForm({
  form,
}: {
  form: UseFormReturn<z.infer<typeof ConfigurationFormSchema>>;
}) {
  const voice = form.watch('voice');
  const selectedVoiceData = voicesData[voice];

  return (
    <Card>
      <CardHeader className="p-4 pt-6 sm:p-6 sm:pb-2">
        <CardTitle className="flex flex-row">
          Voice
          <TooltipProvider>
            <Tooltip delayDuration={100} supportMobileTap>
              <TooltipTrigger asChild>
                <Button
                  className="h-auto w-auto self-end pb-[2px]"
                  size="icon"
                  variant="link"
                >
                  <Info className="ml-2 h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="whitespace-break-spaces lg:max-w-80">
                <p>
                  Model: Orpheus-TTS (text-to-speech AI model) - Commercial use
                  ✔️
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>Select a voice for the assistant</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        <Select
          onValueChange={(value) => form.setValue('voice', value as VoiceId)}
          value={voice}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a voice" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(voicesData).map((voiceOption) => (
              <SelectItem
                className="cursor-pointer py-3"
                key={voiceOption.id}
                value={voiceOption.id}
              >
                {capitalizeFirstLetter(voiceOption.name)} | {voiceOption.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedVoiceData && (
          <div className="space-y-2">
            <p className="font-medium text-sm">
              {selectedVoiceData.description}
            </p>
            <p className="text-muted-foreground text-xs">
              <strong>Tone:</strong> {selectedVoiceData.tone}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
