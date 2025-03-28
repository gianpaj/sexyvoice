import type { Dispatch, SetStateAction } from 'react';
import {
  Select,
  SelectContent,
  // SelectGroup,
  SelectItem,
  // SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

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
        <CardTitle>Select Voice</CardTitle>
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
