'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type langDict from '@/lib/i18n/dictionaries/en.json';

interface Props {
  value: string;
  onChange: (language: string) => void;
  subtask: string;
  onSubtaskChange: (subtask: string) => void;
  disabled?: boolean;
  isEnglishOnly?: boolean;
  dict: (typeof langDict)['transcribe']['languageSelector'];
}

export const WHISPER_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'da', name: 'Danish' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'el', name: 'Greek' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'he', name: 'Hebrew' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'bn', name: 'Bengali' },
] as const;

export function LanguageSelector({
  value,
  onChange,
  subtask,
  onSubtaskChange,
  disabled,
  isEnglishOnly,
  dict,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <label
          className="font-medium text-foreground text-sm"
          htmlFor="language-select"
        >
          {dict.label}
        </label>
        <Select
          disabled={disabled || isEnglishOnly}
          onValueChange={onChange}
          value={isEnglishOnly ? 'en' : value}
        >
          <SelectTrigger className="w-full bg-muted/30" id="language-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WHISPER_LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isEnglishOnly && (
          <p className="text-muted-foreground text-xs">
            {dict.englishOnlyHint}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="font-medium text-foreground text-sm"
          htmlFor="subtask-select"
        >
          {dict.taskLabel}
        </label>
        <Select
          disabled={disabled || isEnglishOnly}
          onValueChange={onSubtaskChange}
          value={isEnglishOnly ? 'transcribe' : subtask}
        >
          <SelectTrigger className="w-full bg-muted/30" id="subtask-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="transcribe">{dict.transcribe}</SelectItem>
            <SelectItem value="translate">{dict.translate}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{dict.taskHint}</p>
      </div>
    </div>
  );
}
