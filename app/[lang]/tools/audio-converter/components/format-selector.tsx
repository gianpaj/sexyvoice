'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'flac' | 'm4a' | 'mp4';

interface Props {
  value: AudioFormat;
  onChange: (value: AudioFormat) => void;
  disabled: boolean;
  dict: {
    label: string;
    placeholder: string;
  };
}

const formats: { value: AudioFormat; label: string; description: string }[] = [
  { value: 'mp3', label: 'MP3', description: 'Most compatible' },
  { value: 'wav', label: 'WAV', description: 'Lossless quality' },
  { value: 'aac', label: 'AAC', description: 'Better than MP3' },
  { value: 'ogg', label: 'OGG', description: 'Open format' },
  { value: 'flac', label: 'FLAC', description: 'Lossless compressed' },
  { value: 'm4a', label: 'M4A', description: 'Apple standard' },
];

export function FormatSelector({ value, onChange, disabled, dict }: Props) {
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground" htmlFor="format-select">
        {dict.label}
      </Label>
      <Select disabled={disabled} onValueChange={onChange} value={value}>
        <SelectTrigger
          className="h-14 w-full border-border bg-background text-base transition-colors hover:border-brand-purple/50 focus:ring-1 focus:ring-brand-purple"
          id="format-select"
        >
          <SelectValue placeholder={dict.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {formats.map((format) => (
            <SelectItem
              className="cursor-pointer py-3 focus:bg-muted"
              key={format.value}
              value={format.value}
            >
              {format.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
