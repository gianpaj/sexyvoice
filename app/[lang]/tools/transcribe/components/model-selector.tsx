'use client';

import type langDict from '@/lib/i18n/dictionaries/en.json';

interface Props {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  dict: (typeof langDict)['transcribe']['modelSelector'];
}

export const WHISPER_MODELS = [
  {
    id: 'onnx-community/whisper-tiny',
    label: 'Whisper Tiny (~40 MB)',
    size: '~40 MB',
    multilingual: true,
  },
  {
    id: 'onnx-community/whisper-base',
    label: 'Whisper Base (~75 MB)',
    size: '~75 MB',
    multilingual: true,
  },
  {
    id: 'onnx-community/whisper-small',
    label: 'Whisper Small (~250 MB)',
    size: '~250 MB',
    multilingual: true,
  },
  {
    id: 'onnx-community/whisper-tiny.en',
    label: 'Whisper Tiny (English only, ~40 MB)',
    size: '~40 MB',
    multilingual: false,
  },
  {
    id: 'onnx-community/whisper-base.en',
    label: 'Whisper Base (English only, ~75 MB)',
    size: '~75 MB',
    multilingual: false,
  },
] as const;

export function ModelSelector({ value, onChange, disabled, dict }: Props) {
  return (
    <div className="space-y-2">
      <label
        className="font-medium text-foreground text-sm"
        htmlFor="model-select"
      >
        {dict.label}
      </label>
      <select
        className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        disabled={disabled}
        id="model-select"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        {WHISPER_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      <p className="text-muted-foreground text-xs">{dict.hint}</p>
    </div>
  );
}
