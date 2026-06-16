'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type langDict from '@/messages/en.json';

import { WHISPER_MODELS } from './models';

interface Props {
  dict: (typeof langDict)['transcribe']['modelSelector'];
  disabled?: boolean;
  onChange: (model: string) => void;
  value: string;
}

export function ModelSelector({ value, onChange, disabled, dict }: Props) {
  return (
    <div className="space-y-2">
      <label
        className="font-medium text-foreground text-sm"
        htmlFor="model-select"
      >
        {dict.label}
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
      <p className="text-muted-foreground text-xs">{dict.hint}</p>
    </div>
  );
}
