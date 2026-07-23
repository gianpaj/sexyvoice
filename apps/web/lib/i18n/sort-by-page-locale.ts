/**
 * Reorders locale-tagged items so the ones matching the current page locale come
 * first, leaving every other item in its original relative order.
 *
 * Matching is an exact comparison on `code`. Substring matching (e.g.
 * `'en-multi'.indexOf('en')`) would make `en` match `en-multi`, which is not the
 * same language for the caller's purposes.
 *
 * @param items - Locale-tagged items. Never mutated.
 * @param pageLocale - The locale of the page being rendered (e.g. 'it').
 * @returns A new array with the page locale's items hoisted to the front.
 */
export function sortByPageLocale<T extends { code: string }>(
  items: readonly T[],
  pageLocale: string,
): T[] {
  const preferred: T[] = [];
  const rest: T[] = [];

  for (const item of items) {
    if (item.code === pageLocale) {
      preferred.push(item);
    } else {
      rest.push(item);
    }
  }

  return [...preferred, ...rest];
}
