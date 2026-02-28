/** biome-ignore-all lint/complexity/noForEach: fine */
import { existsSync, statSync } from 'node:fs';
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

/**
 * Get the file modification time for a page source file.
 * Falls back to a fixed date if the file cannot be read.
 */
function getFileLastModified(filePath: string): string {
  try {
    const fullPath = join(process.cwd(), filePath);
    const stat = statSync(fullPath);
    return stat.mtime.toISOString();
  } catch {
    // Fallback: use a reasonable fixed date rather than "now"
    return '2025-01-01T00:00:00.000Z';
  }
}

/**
 * Assign a priority based on the URL path pattern.
 *
 * - Homepage: 1.0
 * - Tools pages: 0.8 (high-value free tools that drive organic traffic)
 * - Blog posts: 0.7 (content marketing)
 * - Policy pages: 0.3
 * - Auth pages (login/signup): 0.4
 * - Everything else: 0.5
 */
function getPriority(url: string): number {
  // Homepage — ends with /{lang} or /{lang}/
  if (/\/[a-z]{2}\/?$/.test(url)) return 1.0;

  if (url.includes('/tools/')) return 0.8;
  if (url.includes('/blog/')) return 0.7;
  if (url.includes('/login') || url.includes('/signup')) return 0.4;
  if (url.includes('/privacy') || url.includes('/terms')) return 0.3;

  return 0.5;
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

      const fullUrl = `${BASE_URL}${url}`;
      const lastModified = getFileLastModified(page);
      const priority = getPriority(fullUrl);

      if (lang === i18n.defaultLocale && pageHasLangPath) {
        routes.push({
          url: fullUrl,
          lastModified,
          priority,
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
        routes.push({
          url: fullUrl,
          lastModified,
          priority,
        });
      }
    });

    // Add individual entries for translated posts
    allPosts
      .filter((post) => post.locale === lang)
      .forEach((post) => {
        const slug = post.slugAsParams;
        const locale = post.locale;
        const postUrl = `${BASE_URL}/${locale}/blog/${slug}`;
        // Use the post's frontmatter date as lastModified
        const lastModified = new Date(post.date).toISOString();

        if (lang === i18n.defaultLocale) {
          // Build alternates only for locales where the post actually exists
          const alternates: Record<string, string> = {};

          i18n.locales.forEach((loc) => {
            if (loc !== i18n.defaultLocale && checkPostExists(slug, loc)) {
              alternates[loc] = `${BASE_URL}/${loc}/blog/${slug}`;
            }
          });

          routes.push({
            url: postUrl,
            lastModified,
            priority: getPriority(postUrl),
            ...(Object.keys(alternates).length > 0 && {
              alternates: {
                languages: alternates,
              },
            }),
          });
        } else {
          routes.push({
            url: postUrl,
            lastModified,
            priority: getPriority(postUrl),
          });
        }
      });
  });

  const removedDuplicates = routes.filter(
    (route, index, self) =>
      index === self.findIndex((t) => t.url === route.url),
  );

  return removedDuplicates;
}
