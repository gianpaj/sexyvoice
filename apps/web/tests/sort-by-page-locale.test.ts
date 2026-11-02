import { describe, expect, it } from 'vitest';

import { sortByPageLocale } from '@/lib/i18n/sort-by-page-locale';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
] as const;

describe('sortByPageLocale', () => {
  it('hoists the page locale to the front', () => {
    const result = sortByPageLocale(LANGUAGES, 'it');

    expect(result.map((l) => l.code)).toEqual(['it', 'en', 'es']);
  });

  it('preserves the original order when the page locale is absent', () => {
    const result = sortByPageLocale(LANGUAGES, 'de');

    expect(result.map((l) => l.code)).toEqual(['en', 'es', 'it']);
  });

  it('is a no-op when the page locale is already first', () => {
    const result = sortByPageLocale(LANGUAGES, 'en');

    expect(result.map((l) => l.code)).toEqual(['en', 'es', 'it']);
  });

  it('does not mutate the input array', () => {
    const items = [...LANGUAGES];

    sortByPageLocale(items, 'it');

    expect(items.map((l) => l.code)).toEqual(['en', 'es', 'it']);
  });

  it('returns a new array instance', () => {
    const items = [...LANGUAGES];

    expect(sortByPageLocale(items, 'en')).not.toBe(items);
  });

  it('handles an empty array', () => {
    expect(sortByPageLocale([], 'en')).toEqual([]);
  });

  it('matches locale codes exactly rather than by substring', () => {
    // `'en-multi'.indexOf('en') === 0`, so a substring match would hoist it.
    const codes = [{ code: 'en-multi' }, { code: 'es' }, { code: 'en' }];

    const result = sortByPageLocale(codes, 'en');

    expect(result.map((l) => l.code)).toEqual(['en', 'en-multi', 'es']);
  });

  it('keeps relative order among several items sharing the page locale', () => {
    const codes = [
      { code: 'es', id: 1 },
      { code: 'en', id: 2 },
      { code: 'es', id: 3 },
    ];

    const result = sortByPageLocale(codes, 'es');

    expect(result.map((l) => l.id)).toEqual([1, 3, 2]);
  });
});
