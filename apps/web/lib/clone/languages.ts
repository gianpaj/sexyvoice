export interface CloneSupportedLocale {
  code: string;
  value: string;
}

export interface InworldLangConfig {
  // Enum used by the clone API (`langCode`).
  langCode: string;
  // BCP-47 tag used by the synthesize API (`language`).
  language: string;
}

// Replicate multilingual supports the following languages.
// https://replicate.com/resemble-ai/chatterbox-multilingual/api/schema
export const CLONE_SUPPORTED_LOCALES: readonly CloneSupportedLocale[] = [
  { code: 'ar', value: 'arabic' },
  { code: 'da', value: 'danish' },
  { code: 'de', value: 'german' },
  { code: 'el', value: 'greek' },
  { code: 'en', value: 'english' },
  { code: 'en-multi', value: 'english' },
  { code: 'es', value: 'spanish' },
  { code: 'fi', value: 'finnish' },
  { code: 'fr', value: 'french' },
  { code: 'he', value: 'hebrew' },
  { code: 'hi', value: 'hindi' },
  { code: 'it', value: 'italian' },
  { code: 'ja', value: 'japanese' },
  { code: 'ko', value: 'korean' },
  { code: 'ms', value: 'malay' },
  { code: 'nl', value: 'dutch' },
  { code: 'no', value: 'norwegian' },
  { code: 'pl', value: 'polish' },
  { code: 'pt', value: 'portuguese' },
  { code: 'ru', value: 'russian' },
  { code: 'sv', value: 'swedish' },
  { code: 'sw', value: 'swahili' },
  { code: 'tr', value: 'turkish' },
  { code: 'zh', value: 'chinese' },
];

export const CLONE_SUPPORTED_LOCALE_VALUES = Object.fromEntries(
  CLONE_SUPPORTED_LOCALES.map(({ code, value }) => [code, value]),
) as Record<string, string>;

// Maps our internal locale codes → Inworld language identifiers. The keys of
// this map are the source of truth for which locales Inworld can clone.
export const INWORLD_LANG_CONFIG: Record<string, InworldLangConfig> = {
  ar: { langCode: 'AR_SA', language: 'ar-SA' },
  de: { langCode: 'DE_DE', language: 'de-DE' },
  en: { langCode: 'EN_US', language: 'en-US' },
  es: { langCode: 'ES_ES', language: 'es-ES' },
  fr: { langCode: 'FR_FR', language: 'fr-FR' },
  he: { langCode: 'HE_IL', language: 'he-IL' },
  hi: { langCode: 'HI_IN', language: 'hi-IN' },
  it: { langCode: 'IT_IT', language: 'it-IT' },
  ja: { langCode: 'JA_JP', language: 'ja-JP' },
  ko: { langCode: 'KO_KR', language: 'ko-KR' },
  nl: { langCode: 'NL_NL', language: 'nl-NL' },
  pl: { langCode: 'PL_PL', language: 'pl-PL' },
  pt: { langCode: 'PT_BR', language: 'pt-BR' },
  ru: { langCode: 'RU_RU', language: 'ru-RU' },
  zh: { langCode: 'ZH_CN', language: 'zh-CN' },
};

export const INWORLD_SUPPORTED_LOCALE_CODES = new Set(
  Object.keys(INWORLD_LANG_CONFIG),
);

export function isInworldSupportedLocale(locale: string): boolean {
  return INWORLD_SUPPORTED_LOCALE_CODES.has(locale);
}
