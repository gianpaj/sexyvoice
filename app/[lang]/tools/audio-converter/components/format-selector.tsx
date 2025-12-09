'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

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

const formats: { value: AudioFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'ogg', label: 'OGG' },
  { value: 'aac', label: 'AAC' },
  { value: 'flac', label: 'FLAC' },
  { value: 'm4a', label: 'M4A' },
  { value: 'mp4', label: 'MP4' },
];

export function FormatSelector({ value, onChange, disabled, dict }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="format-select">{dict.label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="format-select">
          <SelectValue placeholder={dict.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {formats.map((format) => (
            <SelectItem key={format.value} value={format.value}>
              {format.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
