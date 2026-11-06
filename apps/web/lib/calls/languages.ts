/**
 * Languages a call can speak, as the codes the agent receives. Each one needs
 * a greeting in `greetings.ts`; the picker translates the names.
 */
export const CALL_LANGUAGES = [
  'ar',
  'cs',
  'da',
  'de',
  'en',
  'es',
  'fi',
  'fr',
  'hi',
  'it',
  'ja',
  'ko',
  'nl',
  'no',
  'pl',
  'pt',
  'ru',
  'sv',
  'tr',
  'zh',
] as const;

export type CallLanguage = (typeof CALL_LANGUAGES)[number];

export const DEFAULT_CALL_LANGUAGE: CallLanguage = 'en';

const LANGUAGES = new Set<string>(CALL_LANGUAGES);

export const isCallLanguage = (value: string): value is CallLanguage =>
  LANGUAGES.has(value);

/** A website locale as a call language, falling back to English. */
export const toCallLanguage = (value: string): CallLanguage =>
  isCallLanguage(value) ? value : DEFAULT_CALL_LANGUAGE;
