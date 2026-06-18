'use client';

import { useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WHISPER_MODELS } from './models';

interface Props {
  disabled?: boolean;
  onChange: (model: string) => void;
  value: string;
}

export function ModelSelector({ value, onChange, disabled }: Props) {
  const t = useTranslations('transcribe.modelSelector');

  return (
    <div className="space-y-2">
      <label
        className="font-medium text-foreground text-sm"
        htmlFor="model-select"
      >
        {t('label')}
      </label>
      <Select disabled={disabled} onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full bg-muted/30" id="model-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WHISPER_MODELS.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">{t('hint')}</p>
    </div>
  );
}
