'server-only';

import type lang from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from './i18n-config';

// Helper function with proper overloads
async function importDictionary<K extends keyof typeof lang>(
  path: string,
  key: K,
): Promise<(typeof lang)[K]>;
async function importDictionary(path: string): Promise<typeof lang>;
async function importDictionary<K extends keyof typeof lang>(
  path: string,
  key?: K,
): Promise<(typeof lang)[K] | typeof lang> {
  const module =
    path === './dictionaries/en.json'
      ? await import('./dictionaries/en.json')
      : await import('./dictionaries/es.json');
  return key ? module.default[key] : module.default;
}

const dictionaries = {
  en: <K extends keyof typeof lang>(key?: K) =>
    key
      ? importDictionary('./dictionaries/en.json', key)
      : importDictionary('./dictionaries/en.json'),
  es: <K extends keyof typeof lang>(key?: K) =>
    key
      ? importDictionary('./dictionaries/es.json', key)
      : importDictionary('./dictionaries/es.json'),
};

// Function overloads for proper typing
export function getDictionary<K extends keyof typeof lang>(
  locale: Locale,
  key: K,
): Promise<(typeof lang)[K]>;
export function getDictionary(locale: Locale): Promise<typeof lang>;
export function getDictionary<K extends keyof typeof lang>(
  locale: Locale,
  key?: K,
): Promise<(typeof lang)[K] | typeof lang> {
  return key ? dictionaries[locale](key) : dictionaries[locale]();
}
