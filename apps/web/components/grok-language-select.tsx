'use client';

import { useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GROK_LANGUAGES, type GrokLanguage } from '@/lib/tts/models';

const LABEL_KEYS = {
  'ar-AE': 'langArabicUnitedArabEmirates',
  'ar-EG': 'langArabicEgypt',
  'ar-SA': 'langArabicSaudiArabia',
  auto: 'langAutomatic',
  bn: 'langBengali',
  de: 'langGerman',
  en: 'langEnglish',
  'es-ES': 'langSpanishSpain',
  'es-MX': 'langSpanishMexico',
  fr: 'langFrench',
  hi: 'langHindi',
  id: 'langIndonesian',
  it: 'langItalian',
  ja: 'langJapanese',
  ko: 'langKorean',
  'pt-BR': 'langPortugueseBrazil',
  'pt-PT': 'langPortuguesePortugal',
  ru: 'langRussian',
  tr: 'langTurkish',
  vi: 'langVietnamese',
  zh: 'langChinese',
} as const satisfies Record<GrokLanguage, string>;

/** The language a Grok voice speaks, a generation setting. */
export function GrokLanguageSelect({
  onChange,
  value,
}: {
  onChange: (language: string) => void;
  value: string;
}) {
  const t = useTranslations('generate.grok');

  return (
    <div className="space-y-2 sm:w-1/3">
      <div className="font-medium text-sm">{t('languageLabel')}</div>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('languageSelectPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {GROK_LANGUAGES.map((language) => (
            <SelectItem key={language} value={language}>
              {t(LABEL_KEYS[language])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
