/** biome-ignore-all lint/complexity/noForEach: sitemap generation is clearer this way */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { allPosts } from 'contentlayer/generated';
import { globby } from 'globby';
import type { MetadataRoute } from 'next';

import { routing } from '@/src/i18n/routing';

const BASE_URL = 'https://sexyvoice.ai';

/**
 * Derive the URL path from a page file path.
 * e.g. "app/[lang]/(auth)/login/page.tsx" → "/login"
 */
function pageFileToPath(file: string): string {
  return file
    .replace('app/[lang]', '')
    .replace(/\/\([^)]+\)/g, '') // strip route groups like (auth), (dashboard)
    .replace('/page.tsx', '')
    .replace('/page.ts', '')
    .replace(/^$/, '/'); // root page becomes "/"
}

/**
 * Get the file's last-modified time from the filesystem.
 * Falls back to a fixed date if the file cannot be read.
 */
function getFileLastModified(filePath: string): string {
  try {
    const fullPath = join(process.cwd(), 'app', filePath.replace(/^app\//, ''));
    return statSync(fullPath).mtime.toISOString();
  } catch {
    return '2025-01-01T00:00:00.000Z';
  }
}

/**
 * Assign a sitemap priority based on URL path pattern.
 *
 * - Homepage: 1.0
 * - Tools pages: 0.8  (free tools that drive organic traffic)
 * - Blog posts: 0.7   (content marketing)
 * - Auth pages: 0.4
 * - Policy pages: 0.3
 * - Everything else: 0.5
 */
function getPriority(url: string): number {
  if (/\/[a-z]{2}\/?$/.test(url)) return 1.0;
  if (url.includes('/tools/')) return 0.8;
  if (url.includes('/blog/')) return 0.7;
  if (url.includes('/login') || url.includes('/signup')) return 0.4;
  if (url.includes('/privacy') || url.includes('/terms')) return 0.3;
  return 0.5;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Discover all public page files under app/[lang], excluding:
  //   - protected auth callback pages
  //   - authenticated dashboard pages
  //   - dynamic blog [slug] pages (handled separately via allPosts)
  //   - the sitemap/layout files themselves
  const pageFiles = await globby([
    'app/[lang]/**/page{.ts,.tsx}',
    '!app/[lang]/**/protected/**',
    '!app/[lang]/**/dashboard/**',
    '!app/[lang]/blog/[slug]/**',
  ]);

  const routes: MetadataRoute.Sitemap = [];

  const translatedPostSlugs = new Map(
    allPosts.map((post) => [`${post.locale}:${post.slugAsParams}`, post]),
  );

  routing.locales.forEach((lang) => {
    // Static pages discovered from the filesystem
    pageFiles.forEach((file) => {
      const path = pageFileToPath(file);
      const fullPath = path === '/' ? `/${lang}` : `/${lang}${path}`;
      const url = `${BASE_URL}${fullPath}`;
      const lastModified = getFileLastModified(file);
      const priority = getPriority(url);

      routes.push({
        url,
        lastModified,
        priority,
        // Emit hreflang alternates for the root homepage only
        ...(path === '/'
          ? {
              alternates: {
                languages: Object.fromEntries(
                  routing.locales
                    .filter((locale) => locale !== lang)
                    .map((locale) => [locale, `${BASE_URL}/${locale}`]),
                ),
              },
            }
          : {}),
      });
    });

    // Blog posts (sourced from Contentlayer, not the filesystem glob)
    allPosts
      .filter((post) => post.locale === lang)
      .forEach((post) => {
        const postUrl = `${BASE_URL}/${post.locale}/blog/${post.slugAsParams}`;

        routes.push({
          url: postUrl,
          lastModified: new Date(post.date).toISOString(),
          priority: getPriority(postUrl),
          // For default-locale posts, link to any available translations
          ...(lang === routing.defaultLocale
            ? {
                alternates: {
                  languages: Object.fromEntries(
                    routing.locales
                      .filter(
                        (locale) =>
                          locale !== routing.defaultLocale &&
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

  // Deduplicate in case any page appears under multiple route groups
  return routes.filter(
    (route, index, self) =>
      index === self.findIndex((candidate) => candidate.url === route.url),
  );
}
