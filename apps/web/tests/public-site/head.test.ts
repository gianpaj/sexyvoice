import { describe, expect, it, vi } from 'vitest';

import { routing } from '@/src/i18n/routing';
import { renderHead } from './render';
import { blogPostRoute, publicRoutes } from './routes';

vi.mock('next/font/google', () => ({ Inter: () => ({ className: 'inter' }) }));
vi.mock('contentlayer/generated', () => import('./content-fixtures'));
vi.mock('next-intl/server', () => import('./intl-server'));

const SITE = 'https://sexyvoice.ai';

function attribute(tags: string[], selector: RegExp, name: string) {
  const tag = tags.find((candidate) => selector.test(candidate));
  return tag?.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

function titles(tags: string[]) {
  return {
    og: attribute(tags, /property="og:title"/, 'content'),
    title: tags.find((tag) => tag.startsWith('<title>'))?.slice(7, -8),
    twitter: attribute(tags, /name="twitter:title"/, 'content'),
  };
}

function alternates(tags: string[]) {
  return Object.fromEntries(
    tags
      .filter((tag) => tag.startsWith('<link rel="alternate" hrefLang='))
      .map((tag) => [
        attribute([tag], /hrefLang/, 'hrefLang'),
        attribute([tag], /href=/, 'href'),
      ]),
  );
}

describe.each(Object.entries(publicRoutes))('%s head', (_name, route) => {
  it.each(routing.locales)('%s', async (lang) => {
    expect(await renderHead(route, lang)).toMatchSnapshot();
  });
});

describe('blog post head', () => {
  it.each([
    ['en', 'hello-from-sexyvoice'],
    ['es', 'hello-from-sexyvoice'],
    ['de', 'realtime-ai-voice-call'],
    ['en', 'voice-ai-glossary'],
  ] as const)('%s %s', async (lang, slug) => {
    expect(await renderHead(blogPostRoute(slug), lang)).toMatchSnapshot();
  });
});

describe('head rules', () => {
  // Utility pages without their own metadata keep the layout defaults.
  const { cliLogin, resetPassword, wrapped, ...localizedRoutes } = publicRoutes;

  describe.each(Object.entries(localizedRoutes))('%s', (_name, route) => {
    it.each(routing.locales)(
      'links every locale and x-default in %s',
      async (lang) => {
        const tags = await renderHead(route, lang);
        const url = (locale: string) => `${SITE}/${locale}${route.path}`;

        expect(attribute(tags, /rel="canonical"/, 'href')).toBe(url(lang));
        expect(alternates(tags)).toEqual({
          ...Object.fromEntries(
            routing.locales.map((locale) => [locale, url(locale)]),
          ),
          'x-default': url(routing.defaultLocale),
        });
        expect(attribute(tags, /property="og:url"/, 'content')).toBe(url(lang));
      },
    );

    it.each(routing.locales)('shares the page title in %s', async (lang) => {
      const { og, title, twitter } = titles(await renderHead(route, lang));
      expect(og).toBe(title);
      expect(twitter).toBe(title);
    });
  });

  describe.each(Object.entries(publicRoutes))('%s', (_name, route) => {
    it.each(routing.locales)(
      'appends the brand once and carries an image in %s',
      async (lang) => {
        const tags = await renderHead(route, lang);
        for (const title of Object.values(titles(tags))) {
          expect(title).not.toMatch(/SexyVoice\.ai \| SexyVoice\.ai$/);
          expect(title).not.toMatch(/ - SexyVoice\.ai \|/);
        }
        expect(attribute(tags, /property="og:image"/, 'content')).toMatch(
          /^https:\/\//,
        );
        expect(attribute(tags, /name="twitter:image"/, 'content')).toMatch(
          /^https:\/\//,
        );
      },
    );
  });

  it('links a post only to its translations', async () => {
    const tags = await renderHead(blogPostRoute('voice-ai-glossary'), 'en');
    expect(alternates(tags)).toEqual({
      en: `${SITE}/en/blog/voice-ai-glossary`,
      'x-default': `${SITE}/en/blog/voice-ai-glossary`,
    });
  });
});
