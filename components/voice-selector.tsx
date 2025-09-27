import { Info } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import { AudioPlayer } from '@/app/[lang]/(dashboard)/dashboard/history/audio-player';
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
  // SelectGroup,
  SelectItem,
  // SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getEmotionTags } from '@/lib/ai';
import type lang from '@/lib/i18n/dictionaries/en.json';
import { capitalizeFirstLetter } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Textarea } from './ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export function VoiceSelector({
  publicVoices,
  selectedVoice,
  setSelectedVoice,
  selectedStyle,
  setSelectedStyle,
  temperature,
  setTemperature,
  dict,
}: {
  publicVoices: Voice[];
  selectedVoice?: Voice;
  setSelectedVoice: Dispatch<SetStateAction<string>>;
  selectedStyle?: string;
  setSelectedStyle: Dispatch<SetStateAction<string | undefined>>;
  temperature: number;
  setTemperature: Dispatch<SetStateAction<number>>;
  dict: (typeof lang)['generate'];
}) {
  const isGeminiVoice = selectedVoice?.model === 'gpro';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-row">
          {dict.voiceSelector.title}
          <TooltipProvider>
            <Tooltip delayDuration={100} supportMobileTap>
              <TooltipTrigger asChild>
                <Button
                  className="h-auto w-auto self-end pb-[2px]"
                  variant="link"
                  size="icon"
                >
                  <Info className="w-4 h-4 ml-2" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="whitespace-break-spaces lg:max-w-80">
                {isGeminiVoice ? (
                  <p>{dict.voiceSelector.geminiInfo}</p>
                ) : (
                  <p>
                    Model: Orpheus-TTS (text-to-speech AI model) - Commercial
                    use ✔️
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>{dict.voiceSelector.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedVoice?.name} onValueChange={setSelectedVoice}>
          <SelectTrigger>
            <SelectValue placeholder="Select a voice" />
          </SelectTrigger>
          <SelectContent>
            {/* {userVoices.length > 0 && (
              <SelectGroup>
                <SelectLabel>Your Voices</SelectLabel>
                {userVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name} ({voice.language})
                  </SelectItem>
                ))}
              </SelectGroup>
            )} */}
            {publicVoices.length > 0 &&
              publicVoices.map((voice) => (
                <SelectItem key={voice.id} value={voice.name}>
                  {capitalizeFirstLetter(voice.name)} | {voice.language}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {isGeminiVoice && (
          <>
            <Textarea
              onChange={(e) => setSelectedStyle(e.target.value)}
              value={selectedStyle}
              placeholder={dict.voiceSelector.selectStyleTextareaPlaceholder}
            />
            <div className="space-y-3">
              <Label htmlFor="temperature">Temperature: {temperature}</Label>
              <div className="flex items-center space-x-4">
                <TooltipProvider>
                  <Tooltip delayDuration={100} supportMobileTap>
                    <TooltipTrigger asChild>
                      <div className="flex-1">
                        <Slider
                          id="temperature"
                          min={0.5}
                          max={2}
                          step={0.1}
                          value={[temperature]}
                          onValueChange={(value) => setTemperature(value[0])}
                          className="cursor-pointer"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{dict.voiceSelector.temperatureTooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip delayDuration={100} supportMobileTap>
                    <TooltipTrigger asChild>
                      <Input
                        type="number"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value >= 0.5 && value <= 2) {
                            setTemperature(value);
                          }
                        }}
                        className="w-20"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{dict.voiceSelector.temperatureTooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </>
        )}
        {selectedVoice?.sample_url && (
          <div className="flex gap-2 items-center justify-start p-4 lg:w-2/3">
            <AudioPlayer url={selectedVoice.sample_url} />
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                <b>{capitalizeFirstLetter(selectedVoice.name)}</b> sample
                prompt: <i>{selectedVoice.sample_prompt}</i>
              </p>
              {getEmotionTags(selectedVoice.language) && (
                <TooltipProvider>
                  <Tooltip delayDuration={100} supportMobileTap>
                    <TooltipTrigger asChild>
                      <Button
                        className="h-auto w-auto p-1"
                        variant="ghost"
                        size="icon"
                      >
                        <Info className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        <strong>{dict.voiceSelector.toolTipEmotionTags}</strong>
                        <br />
                        {getEmotionTags(selectedVoice.language)}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
