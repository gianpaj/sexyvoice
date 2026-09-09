export type CloneProvider = 'mistral' | 'replicate';

export const VOXTRAL_SUPPORTED_LOCALE_CODES = new Set([
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'hi',
  'it',
  'nl',
  'pt',
]);

// https://replicate.com/resemble-ai/chatterbox-multilingual/api/schema
export const CHATTERBOX_SUPPORTED_LOCALE_CODES = new Set([
  'ar',
  'da',
  'de',
  'el',
  'en',
  'es',
  'fi',
  'fr',
  'he',
  'hi',
  'it',
  'ja',
  'ko',
  'ms',
  'nl',
  'no',
  'pl',
  'pt',
  'ru',
  'sv',
  'sw',
  'tr',
  'zh',
]);

export const CLONE_SUPPORTED_LOCALE_CODES = new Set([
  ...CHATTERBOX_SUPPORTED_LOCALE_CODES,
  ...VOXTRAL_SUPPORTED_LOCALE_CODES,
  // Select Chatterbox explicitly for English instead of Voxtral.
  'en-multi',
]);

export const RTL_CLONE_LOCALE_CODES = new Set(['ar', 'he']);

export const CLONE_TEXT_MAX_LENGTH_NON_VOXTRAL = 300;
export const CLONE_TEXT_MAX_LENGTH_VOXTRAL_FREE = 1000;
export const CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID = 4000;
