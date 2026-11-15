'use client';

import { useTranslations } from 'next-intl';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AUDIO_OUTPUT_FORMATS, type AudioOutputFormat } from '@/lib/ffmpeg';

interface Props {
  disabled: boolean;
  onChange: (value: AudioOutputFormat) => void;
  value: AudioOutputFormat;
}

const formats = Object.entries(AUDIO_OUTPUT_FORMATS).map(
  ([value, { label }]) => ({ label, value: value as AudioOutputFormat }),
);

export function FormatSelector({ value, onChange, disabled }: Props) {
  const t = useTranslations('audioConverter.formatSelector');

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground" htmlFor="format-select">
        {t('label')}
      </Label>
      <Select disabled={disabled} onValueChange={onChange} value={value}>
        <SelectTrigger
          className="h-14 w-full border-border bg-background text-base transition-colors hover:border-brand-purple/50 focus:ring-1 focus:ring-brand-purple"
          id="format-select"
        >
          <SelectValue placeholder={t('placeholder')} />
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
