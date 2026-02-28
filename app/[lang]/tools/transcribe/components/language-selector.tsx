'use client';

import { useMemo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';

interface Props {
  lang: Locale;
  value: string;
  onChange: (language: string) => void;
  subtask: string;
  onSubtaskChange: (subtask: string) => void;
  disabled?: boolean;
  isEnglishOnly?: boolean;
  dict: (typeof langDict)['transcribe']['languageSelector'];
}

export const WHISPER_LANGUAGE_CODES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'da',
  'ru',
  'zh',
  'ja',
  'ko',
  'ar',
  'hi',
  'pl',
  'tr',
  'vi',
  'th',
  'uk',
  'sv',
  'fi',
  'no',
  'el',
  'cs',
  'ro',
  'hu',
  'he',
  'id',
  'ms',
  'ta',
  'te',
  'bn',
] as const;

export function LanguageSelector({
  lang,
  value,
  onChange,
  subtask,
  onSubtaskChange,
  disabled,
  isEnglishOnly,
  dict,
}: Props) {
  const translatedLanguages = useMemo(() => {
    const all = getTranslatedLanguages(lang, WHISPER_LANGUAGE_CODES);
    const current = all.find((l) => l.value === lang);
    const rest = all.filter((l) => l.value !== lang);
    return current ? [current, ...rest] : all;
  }, [lang]);

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
          defaultValue={lang}
          disabled={disabled || isEnglishOnly}
          onValueChange={onChange}
          value={isEnglishOnly ? 'en' : value}
        >
          <SelectTrigger className="w-full bg-muted/30" id="language-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {translatedLanguages.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
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
        <p className="whitespace-pre text-muted-foreground text-xs">
          {dict.taskHint}
        </p>
      </div>
    </div>
  );
}
