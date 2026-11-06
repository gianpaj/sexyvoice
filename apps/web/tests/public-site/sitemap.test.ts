import { describe, expect, it, vi } from 'vitest';

import sitemap from '@/app/sitemap';
import { PUBLIC_PAGES } from '@/lib/public-routes';
import { routing } from '@/src/i18n/routing';

vi.mock('contentlayer/generated', () => import('./content-fixtures'));

describe('sitemap', () => {
  it('lists the public pages and posts of every locale', () => {
    expect(
      sitemap().toSorted((a, b) => a.url.localeCompare(b.url)),
    ).toMatchSnapshot();
  });

  it('lists every public page in every locale with its translations', () => {
    const entries = new Map(sitemap().map((entry) => [entry.url, entry]));

    for (const lang of routing.locales) {
      for (const { path } of PUBLIC_PAGES) {
        const url = `https://sexyvoice.ai/${lang}${path === '/' ? '' : path}`;
        expect(
          Object.keys(entries.get(url)?.alternates?.languages ?? {}),
        ).toEqual(routing.locales.filter((locale) => locale !== lang));
      }
    }
    expect([...entries.keys()].filter((url) => url.includes('['))).toEqual([]);
  });
});
