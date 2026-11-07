import type { MetadataRoute } from 'next';

import {
  listPolicies,
  listPosts,
  policyLocales,
  postLocales,
  postPath,
} from '@/lib/content';
import type { Locale } from '@/lib/i18n/i18n-config';
import {
  POLICY_PRIORITY,
  POST_PRIORITY,
  PUBLIC_PAGES,
} from '@/lib/public-routes';
import { localeUrl } from '@/lib/site';
import { routing } from '@/src/i18n/routing';

/** The page in each of `locales` other than `lang`. */
function alternates(lang: Locale, path: string, locales: readonly Locale[]) {
  return {
    languages: Object.fromEntries(
      locales
        .filter((locale) => locale !== lang)
        .map((locale) => [locale, localeUrl(locale, path)]),
    ),
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.flatMap((lang) => [
    ...PUBLIC_PAGES.map((page) => ({
      alternates: alternates(lang, page.path, routing.locales),
      priority: page.priority,
      url: localeUrl(lang, page.path),
    })),
    ...listPosts(lang).map((post) => ({
      // Posts in the default locale link to their translations.
      ...(lang === routing.defaultLocale && {
        alternates: alternates(lang, postPath(post), postLocales(post.slug)),
      }),
      lastModified: new Date(post.date).toISOString(),
      priority: POST_PRIORITY,
      url: localeUrl(lang, postPath(post)),
    })),
    ...listPolicies(lang).map((policy) => ({
      alternates: alternates(
        lang,
        `/${policy.slug}`,
        policyLocales(policy.slug),
      ),
      priority: POLICY_PRIORITY,
      url: localeUrl(lang, `/${policy.slug}`),
    })),
  ]);
}
