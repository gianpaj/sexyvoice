'server-only';
import type { Locale } from './i18n-config';

const dictionaries = {
  en: () => import('./dictionaries/en.json').then((module) => module.default),
  es: () => import('./dictionaries/es.json').then((module) => module.default),
};

export const getDictionary = async (locale: Locale) => {
  const dictionary = dictionaries[locale];
  if (!dictionary) {
    // Fall back to default locale if locale is invalid
    return dictionaries.en();
  }
  return dictionary();
};
