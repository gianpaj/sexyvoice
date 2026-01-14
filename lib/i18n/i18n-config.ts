export const i18n = {
  defaultLocale: 'en',
  locales: ['en', 'es', 'de'],
  localePrefix: 'always',
} as const;

export type Locale = (typeof i18n)['locales'][number];
export type LocalePrefix = (typeof i18n)['localePrefix'];
