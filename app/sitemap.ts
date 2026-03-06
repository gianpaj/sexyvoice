/** biome-ignore-all lint/complexity/noForEach: sitemap generation is clearer this way */
import { allPosts } from 'contentlayer/generated';
import type { MetadataRoute } from 'next';

import { i18n } from '@/lib/i18n/i18n-config';

const BASE_URL = 'https://sexyvoice.ai';
const STATIC_PAGE_PATHS = [
  '/',
  '/login',
  '/signup',
  '/reset-password',
  '/privacy-policy',
  '/terms',
  '/tools/audio-converter',
  '/tools/audio-joiner',
  '/tools/transcribe',
] as const;

function getPriority(url: string): number {
  if (/\/[a-z]{2}\/?$/.test(url)) return 1.0;
  if (url.includes('/tools/')) return 0.8;
  if (url.includes('/blog/')) return 0.7;
  if (url.includes('/login') || url.includes('/signup')) return 0.4;
  if (url.includes('/privacy') || url.includes('/terms')) return 0.3;
  return 0.5;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [];
  const translatedPostSlugs = new Map(
    allPosts.map((post) => [`${post.locale}:${post.slugAsParams}`, post]),
  );

  i18n.locales.forEach((lang) => {
    STATIC_PAGE_PATHS.forEach((path) => {
      const fullPath = path === '/' ? `/${lang}` : `/${lang}${path}`;
      const url = `${BASE_URL}${fullPath}`;

      routes.push({
        url,
        lastModified: '2025-01-01T00:00:00.000Z',
        priority: getPriority(url),
        ...(path === '/'
          ? {
              alternates: {
                languages: Object.fromEntries(
                  i18n.locales
                    .filter((locale) => locale !== lang)
                    .map((locale) => [locale, `${BASE_URL}/${locale}`]),
                ),
              },
            }
          : {}),
      });
    });

    allPosts
      .filter((post) => post.locale === lang)
      .forEach((post) => {
        const postUrl = `${BASE_URL}/${post.locale}/blog/${post.slugAsParams}`;

        routes.push({
          url: postUrl,
          lastModified: new Date(post.date).toISOString(),
          priority: getPriority(postUrl),
          ...(lang === i18n.defaultLocale
            ? {
                alternates: {
                  languages: Object.fromEntries(
                    i18n.locales
                      .filter(
                        (locale) =>
                          locale !== i18n.defaultLocale &&
                          translatedPostSlugs.has(
                            `${locale}:${post.slugAsParams}`,
                          ),
                      )
                      .map((locale) => [
                        locale,
                        `${BASE_URL}/${locale}/blog/${post.slugAsParams}`,
                      ]),
                  ),
                },
              }
            : {}),
        });
      });
  });

  return routes.filter(
    (route, index, self) =>
      index === self.findIndex((candidate) => candidate.url === route.url),
  );
}
