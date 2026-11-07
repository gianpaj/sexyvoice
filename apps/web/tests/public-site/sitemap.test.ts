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

  it('links each translated post both ways', () => {
    const entries = new Map(sitemap().map((entry) => [entry.url, entry]));
    const languages = (url: string) =>
      entries.get(`https://sexyvoice.ai${url}`)?.alternates?.languages;

    expect(languages('/en/blog/hello-from-sexyvoice')).toEqual({
      es: 'https://sexyvoice.ai/es/blog/hello-from-sexyvoice',
    });
    expect(languages('/es/blog/hello-from-sexyvoice')).toEqual({
      en: 'https://sexyvoice.ai/en/blog/hello-from-sexyvoice',
    });
  });

  it('lists each policy only in the locales it is written in', () => {
    const policies = sitemap()
      .filter(({ url }) => /\/(privacy-policy|terms)$/.test(url))
      .map(({ alternates, url }) => [
        url,
        Object.keys(alternates?.languages ?? {}),
      ]);

    expect(policies).toEqual([
      ['https://sexyvoice.ai/en/privacy-policy', ['es']],
      ['https://sexyvoice.ai/en/terms', ['es']],
      ['https://sexyvoice.ai/es/privacy-policy', ['en']],
      ['https://sexyvoice.ai/es/terms', ['en']],
    ]);
  });
});
