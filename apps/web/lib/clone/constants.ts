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

export const CLONE_TEXT_MAX_LENGTH_NON_VOXTRAL = 300;
export const CLONE_TEXT_MAX_LENGTH_VOXTRAL_FREE = 1000;
export const CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID = 4000;
