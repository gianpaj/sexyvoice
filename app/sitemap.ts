/** biome-ignore-all lint/complexity/noForEach: fine */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { allPosts } from 'contentlayer/generated';
import { globby } from 'globby';
import type { MetadataRoute } from 'next';

import { i18n } from '@/lib/i18n/i18n-config';

function addPage(page: string) {
  const path = page
    .replace('app', '')
    .replace('.tsx', '')
    .replace('.mdx', '')
    .replace('/page', '');
  return path;
}

function checkPostExists(slug: string, locale: string): boolean {
  const basePath = join(process.cwd(), 'posts');

  if (locale === i18n.defaultLocale) {
    // For default locale (en), check if file exists without locale suffix
    return existsSync(join(basePath, `${slug}.mdx`));
  }
  // For other locales, check if file exists with locale suffix
  return existsSync(join(basePath, `${slug}.${locale}.mdx`));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let pages = await globby([
    'app/**/page{.ts,.tsx}',
    '!app/**/protected/**',
    '!app/**/dashboard/**',
    // '!app/**/blog/[slug]',
    '!app/_*.js',
    '!app/{sitemap,layout}.{ts,tsx}',
    '!app/api',
  ]);
  pages = pages.filter((page) => !page.endsWith('blog/[slug]/page.tsx'));

  const BASE_URL = 'https://sexyvoice.ai';

  const routes: MetadataRoute.Sitemap = [];
  i18n.locales.forEach((lang) => {
    // Process each page
    pages.forEach((page: string) => {
      let url = addPage(page);

      const pageHasLangPath = url.includes('[lang]');

      url = url.replace('[lang]', lang);
      url = url.replace('(auth)/', '');
      url = url.replace('(dashboard)/', '');

      if (lang === i18n.defaultLocale && pageHasLangPath) {
        routes.push({
          url: `${BASE_URL}${url}`,
          alternates: {
            languages: Object.fromEntries(
              i18n.locales
                .filter((locale) => locale !== lang)
                .map((locale) => [
                  locale,
                  `${BASE_URL}${url.replace('/en', `/${locale}`)}`,
                ]),
            ),
          },
        });
      } else {
        routes.push({ url: `${BASE_URL}${url}` });
      }
    });

    // Add individual entries for translated posts
    allPosts
      .filter((post) => post.locale === lang)
      .forEach((post) => {
        const slug = post.slugAsParams;
        const locale = post.locale;

        if (lang === i18n.defaultLocale) {
          // Build alternates only for locales where the post actually exists
          const alternates: Record<string, string> = {};

          i18n.locales.forEach((loc) => {
            if (loc !== i18n.defaultLocale && checkPostExists(slug, loc)) {
              alternates[loc] = `${BASE_URL}/${loc}/blog/${slug}`;
            }
          });

          routes.push({
            url: `${BASE_URL}/${locale}/blog/${slug}`,
            ...(Object.keys(alternates).length > 0 && {
              alternates: {
                languages: alternates,
              },
            }),
          });
        } else {
          routes.push({
            url: `${BASE_URL}/${locale}/blog/${slug}`,
          });
        }
      });
  });

  const removedDuplicates = routes.filter(
    (route, index, self) =>
      index === self.findIndex((t) => t.url === route.url),
  );

  return [
    ...Array.from(removedDuplicates).map((route, index) => ({
      ...route,
      lastModified: new Date().toISOString(),
      priority: index === 0 ? 1 : 0.5,
    })),
  ];
}
