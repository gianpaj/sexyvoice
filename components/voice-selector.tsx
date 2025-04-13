import { Info, Volume2 } from 'lucide-react';
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
import { capitalizeFirstLetter } from '@/lib/utils';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export function VoiceSelector({
  // userVoices,
  publicVoices,
  selectedVoice,
  setSelectedVoice,
}: {
  // userVoices: Voice[];
  publicVoices: Voice[];
  selectedVoice: string;
  setSelectedVoice: Dispatch<SetStateAction<string>>;
}) {
  const selectedVoiceSample = publicVoices.find(
    (file) => file.name === selectedVoice,
  );

  return (
    <Card>
      <CardHeader>
        {/* TODO: translate */}
        <CardTitle className="flex flex-row">
          Select Voice
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
              <TooltipContent>
                <p>
                  Model: Orpheus-TTS (text-to-speech AI model) - Commercial use
                  ✔️
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>Choose from public voices</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedVoice} onValueChange={setSelectedVoice}>
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
        {selectedVoiceSample?.sample_url && (
          <div className="flex gap-2 items-center justify-between p-4 border rounded-md lg:w-1/2">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Prompt: <i>{selectedVoiceSample.sample_prompt}</i>
              </p>
            </div>

            <AudioPlayer url={selectedVoiceSample.sample_url} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
