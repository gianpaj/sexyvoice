import {
  allPolicyPages,
  allPosts,
  type PolicyPage,
  type Post,
} from 'contentlayer/generated';

import type { Locale } from '@/lib/i18n/i18n-config';
import { routing } from '@/src/i18n/routing';

// The posts and policies the site publishes. Pages, agent markdown and the
// sitemap all read them here, so a draft stays hidden everywhere.

type PostWithCover = Post & { image: string };

/** How many posts the blog index and its markdown list. */
export const BLOG_INDEX_LIMIT = 20;

const publishedPosts = allPosts.filter((post) => !post.draft);

/** Published posts in one locale, newest first. */
export function listPosts(locale: Locale, limit = Number.POSITIVE_INFINITY) {
  return publishedPosts
    .filter((post) => post.locale === locale)
    .toSorted((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, limit);
}

/** Published posts that have the cover image the HTML post cards show. */
export function listPostsWithCover(locale: Locale, limit: number) {
  return listPosts(locale)
    .filter((post): post is PostWithCover => Boolean(post.image))
    .slice(0, limit);
}

export function getPost(locale: Locale, slug: string): Post | undefined {
  return publishedPosts.find(
    (post) => post.locale === locale && post.slug === slug,
  );
}

/** The locales with a published translation of the post. */
export function postLocales(slug: string): Locale[] {
  return routing.locales.filter((locale) => getPost(locale, slug));
}

/** The post's URL path after the locale prefix. */
export function postPath(post: Pick<Post, 'slug'>): string {
  return `/blog/${post.slug}`;
}

/** A post date for readers, such as "April 28, 2025" in English. */
export function formatPostDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(date));
}

export const POLICY_SLUGS = ['privacy-policy', 'terms'] as const;

type PolicySlug = (typeof POLICY_SLUGS)[number];

export function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(value);
}

/** The policies written in `locale`; other locales show the English text. */
export function listPolicies(locale: Locale): PolicyPage[] {
  return allPolicyPages.filter((policy) => policy.locale === locale);
}

/** The locales with a translation of the policy. */
export function policyLocales(slug: string): Locale[] {
  return routing.locales.filter((locale) =>
    listPolicies(locale).some((policy) => policy.slug === slug),
  );
}

/** The policy in one locale, or the English original when untranslated. */
export function getPolicy(
  locale: Locale,
  slug: PolicySlug,
): PolicyPage | undefined {
  const inLocale = (candidate: Locale) =>
    allPolicyPages.find(
      (policy) => policy.slug === slug && policy.locale === candidate,
    );
  return inLocale(locale) ?? inLocale(routing.defaultLocale);
}
