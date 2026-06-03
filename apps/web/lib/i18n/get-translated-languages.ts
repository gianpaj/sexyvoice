import type { Locale } from './i18n-config';

/**
 * Translates an array of language codes into localized display names
 * using the `Intl.DisplayNames` API.
 *
 * @param locale - The locale to translate language names into (e.g. 'en', 'es', 'de')
 * @param codes - An array of language codes (e.g. ['en', 'es', 'fr'])
 * @returns A sorted array of `{ value, label }` objects with translated language names
 */
export function getTranslatedLanguages(
  locale: Locale | string,
  codes: readonly string[],
): { value: string; label: string }[] {
  const languageNames = new Intl.DisplayNames([locale], { type: 'language' });

  return codes
    .map((code) => {
      const name = languageNames.of(code);
      const label = name
        ? `${name.charAt(0).toUpperCase()}${name.slice(1)}`
        : code;
      return { value: code, label };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}
