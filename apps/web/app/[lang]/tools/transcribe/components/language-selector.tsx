'use client';

import { useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';

interface Props {
  disabled?: boolean;
  isEnglishOnly?: boolean;
  lang: Locale;
  onChange: (language: string) => void;
  onSubtaskChange: (subtask: string) => void;
  subtask: string;
  value: string;
}

const WHISPER_LANGUAGE_CODES = [
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
}: Props) {
  const t = useTranslations('transcribe.languageSelector');
  const allLanguages = getTranslatedLanguages(lang, WHISPER_LANGUAGE_CODES);
  const currentLanguage = allLanguages.find((item) => item.value === lang);
  const translatedLanguages = currentLanguage
    ? [currentLanguage, ...allLanguages.filter((item) => item.value !== lang)]
    : allLanguages;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <label
          className="font-medium text-foreground text-sm"
          htmlFor="language-select"
        >
          {t('label')}
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
            {t('englishOnlyHint')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="font-medium text-foreground text-sm"
          htmlFor="subtask-select"
        >
          {t('taskLabel')}
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
            <SelectItem value="transcribe">{t('transcribe')}</SelectItem>
            <SelectItem value="translate">{t('translate')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="whitespace-pre text-muted-foreground text-xs">
          {t('taskHint')}
        </p>
      </div>
    </div>
  );
}
