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

const VOXTRAL_FREE_CHARACTER_LIMIT = 1000;
const VOXTRAL_PAID_CHARACTER_LIMIT = 4000;
const DEFAULT_CLONE_CHARACTER_LIMIT = 300;

export function getCloneCharactersLimit(
  locale: string,
  isPaidUser = false,
): number {
  if (VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale)) {
    return isPaidUser
      ? VOXTRAL_PAID_CHARACTER_LIMIT
      : VOXTRAL_FREE_CHARACTER_LIMIT;
  }

  return DEFAULT_CLONE_CHARACTER_LIMIT;
}
