'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  language: string;
  is_public: boolean;
}

export function VoiceSelector({
  userVoices,
  publicVoices,
  lang,
}: {
  userVoices: Voice[];
  publicVoices: Voice[];
  lang: string;
}) {
  const [selectedVoice, setSelectedVoice] = useState<string>('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Voice</CardTitle>
        <CardDescription>
          Choose from your voices or explore public ones
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select value={selectedVoice} onValueChange={setSelectedVoice}>
          <SelectTrigger>
            <SelectValue placeholder="Select a voice" />
          </SelectTrigger>
          <SelectContent>
            {userVoices.length > 0 && (
              <SelectGroup>
                <SelectLabel>Your Voices</SelectLabel>
                {userVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name} ({voice.language})
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {publicVoices.length > 0 && (
              <SelectGroup>
                <SelectLabel>Public Voices</SelectLabel>
                {publicVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name} ({voice.language})
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
