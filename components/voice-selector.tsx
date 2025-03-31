import { Info } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
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
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface Voice {
  id: string;
  name: string;
  voice: string;
  language: string;
  is_public: boolean;
}

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
      <CardContent>
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
                <SelectItem key={voice.id} value={voice.voice}>
                  {voice.name} ({voice.language})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
