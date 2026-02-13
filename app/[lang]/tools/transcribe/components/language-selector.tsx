'use client';

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
        <select
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || isEnglishOnly}
          id="language-select"
          onChange={(e) => onChange(e.target.value)}
          value={isEnglishOnly ? 'en' : value}
        >
          {WHISPER_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
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
        <select
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || isEnglishOnly}
          id="subtask-select"
          onChange={(e) => onSubtaskChange(e.target.value)}
          value={isEnglishOnly ? 'transcribe' : subtask}
        >
          <option value="transcribe">{dict.transcribe}</option>
          <option value="translate">{dict.translate}</option>
        </select>
        <p className="text-muted-foreground text-xs">{dict.taskHint}</p>
      </div>
    </div>
  );
}
