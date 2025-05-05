import { globby } from 'globby';
import type { MetadataRoute } from 'next';

import { i18n } from '@/lib/i18n/i18n-config';
import { generateStaticParams } from './[lang]/blog/[slug]/page';

function addPage(page: string) {
  const path = page
    .replace('app', '')
    .replace('.tsx', '')
    .replace('.mdx', '')
    .replace('/page', '');
  return path;
}
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let pages = await globby([
    'app/**/page{.ts,.tsx}',
    // '!app/**/blog/[slug]',
    '!app/_*.js',
    '!app/**/{update-password}/**.{ts,tsx}',
    '!app/{sitemap,layout}.{ts,tsx}',
    '!app/api',
  ]);

  const BASE_URL = process.env.VERCEL_URL || 'https://sexyvoice.ai';

  pages = pages.filter((page) => !page.endsWith('blog/[slug]/page.tsx'));

  const routes: MetadataRoute.Sitemap = [];
  i18n.locales.forEach(async (lang: string) => {
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
            languages: {
              es: `${BASE_URL}${url.replace('/en', '/es')}`,
            },
          },
        });
      } else {
        routes.push({ url: `${BASE_URL}${url}` });
      }
    });

    generateStaticParams({ params: { lang } }).forEach(({ slug, locale }) => {
      if (lang === i18n.defaultLocale) {
        routes.push({
          url: `${BASE_URL}/${locale}/blog/${slug}`,
          alternates: {
            languages: {
              es: `${BASE_URL}/es/blog/${slug}.es`,
            },
          },
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
