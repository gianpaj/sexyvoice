export type CloneProvider = 'mistral' | 'replicate';

export const VOXTRAL_CLONE_LOCALES: Readonly<Record<string, string>> = {
  ar: 'arabic',
  de: 'german',
  en: 'english',
  es: 'spanish',
  fr: 'french',
  hi: 'hindi',
  it: 'italian',
  nl: 'dutch',
  pt: 'portuguese',
};

// https://replicate.com/resemble-ai/chatterbox-multilingual/api/schema
export const CHATTERBOX_CLONE_LOCALES: Readonly<Record<string, string>> = {
  ar: 'arabic',
  da: 'danish',
  de: 'german',
  el: 'greek',
  en: 'english',
  es: 'spanish',
  fi: 'finnish',
  fr: 'french',
  he: 'hebrew',
  hi: 'hindi',
  it: 'italian',
  ja: 'japanese',
  ko: 'korean',
  ms: 'malay',
  nl: 'dutch',
  no: 'norwegian',
  pl: 'polish',
  pt: 'portuguese',
  ru: 'russian',
  sv: 'swedish',
  sw: 'swahili',
  tr: 'turkish',
  zh: 'chinese',
};

export const CLONE_LOCALES: Readonly<Record<string, string>> = {
  ...CHATTERBOX_CLONE_LOCALES,
  ...VOXTRAL_CLONE_LOCALES,
  // Select Chatterbox explicitly for English instead of Voxtral.
  'en-multi': 'english',
};

export const VOXTRAL_SUPPORTED_LOCALE_CODES = new Set(
  Object.keys(VOXTRAL_CLONE_LOCALES),
);

export const RTL_CLONE_LOCALE_CODES = new Set(['ar', 'he']);

export const CLONE_TEXT_MAX_LENGTH_NON_VOXTRAL = 300;
export const CLONE_TEXT_MAX_LENGTH_VOXTRAL_FREE = 1000;
export const CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID = 4000;
