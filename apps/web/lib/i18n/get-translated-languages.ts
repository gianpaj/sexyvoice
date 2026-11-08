import type { Locale } from './i18n-config';

/**
 * Translates an array of language codes into localized display names
 * using the `Intl.DisplayNames` API.
 *
 * @param locale - The locale to translate language names into (e.g. 'en', 'es', 'de')
 * @param codes - An array of language codes (e.g. ['en', 'es', 'fr'])
 * @param options.nameOf - The code whose name labels each code, e.g. `pt-BR` for `pt`
 * @param options.languageDisplay - `standard` names regions in parentheses, so
 *   accents of one language sort together
 * @returns A sorted array of `{ value, label }` objects with translated language names
 */
export function getTranslatedLanguages(
  locale: Locale | string,
  codes: readonly string[],
  {
    nameOf = (code: string) => code,
    languageDisplay = 'dialect',
  }: {
    nameOf?: (code: string) => string;
    languageDisplay?: Intl.DisplayNamesOptions['languageDisplay'];
  } = {},
): { value: string; label: string }[] {
  const languageNames = new Intl.DisplayNames([locale], {
    languageDisplay,
    type: 'language',
  });

  return codes
    .map((code) => {
      const name = languageNames.of(nameOf(code));
      const label = name
        ? `${name.charAt(0).toUpperCase()}${name.slice(1)}`
        : code;
      return { label, value: code };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}
