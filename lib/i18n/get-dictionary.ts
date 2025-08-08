'server-only';

import type lang from '@/lib/i18n/dictionaries/en.json';
import { i18n, type Locale } from './i18n-config';

// Helper function with proper overloads
async function importDictionary<K extends keyof typeof lang>(
  locale: string,
  key: K,
): Promise<(typeof lang)[K]>;
async function importDictionary(locale: string): Promise<typeof lang>;
async function importDictionary<K extends keyof typeof lang>(
  locale: string,
  key?: K,
): Promise<(typeof lang)[K] | typeof lang> {
  const module = await import(`./dictionaries/${locale}.json`);
  return key ? module.default[key] : module.default;
}

/**
 * Dictionary mapping for supported locales.
 *
 * This object dynamically creates dictionary loaders for each supported locale.
 * To add a new locale:
 * 1. Add the locale to the Locale type in i18n-config
 * 2. Create the corresponding dictionary file (e.g., ./dictionaries/fr.json)
 * 3. The locale will be automatically supported here
 *
 * Each locale function accepts an optional key parameter to load specific
 * sections of the dictionary, or loads the entire dictionary if no key is provided.
 */
const dictionaries = Object.fromEntries(
  // This assumes Locale type contains all supported locale codes
  i18n.locales.map((locale) => [
    locale,
    <K extends keyof typeof lang>(key?: K) =>
      key ? importDictionary(locale, key) : importDictionary(locale),
  ]),
) as Record<
  Locale,
  <K extends keyof typeof lang>(
    key?: K,
  ) => K extends keyof typeof lang
    ? Promise<(typeof lang)[K]>
    : Promise<typeof lang>
>;

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
