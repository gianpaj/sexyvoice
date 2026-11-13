import type { Metadata } from 'next';

import type { Locale } from '@/lib/i18n/i18n-config';
import { localeUrl, SITE_NAME, SITE_URL } from '@/lib/site';
import { routing } from '@/src/i18n/routing';

const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

interface OgImage {
  alt: string;
  height: number;
  url: string;
  width: number;
}

export const DEFAULT_OG_IMAGE: OgImage = {
  alt: SITE_NAME,
  height: 670,
  url: '/sexyvoice.ai-og-image.jpg',
  width: 1200,
};

/**
 * Defaults for every page under the root layout. A root layout never learns
 * the child's path, so each page adds its URLs with `pageMetadata`.
 */
export function siteMetadata({
  description,
  title,
}: {
  description: string;
  title: string;
}): Metadata {
  const titles = { default: title, template: TITLE_TEMPLATE };
  return {
    description,
    icons: {
      apple: '/apple-touch-icon.png',
      icon: '/favicon.ico',
    },
    metadataBase: new URL(SITE_URL),
    openGraph: {
      description,
      images: [DEFAULT_OG_IMAGE],
      siteName: SITE_NAME,
      title: titles,
      type: 'website',
    },
    title: titles,
    twitter: {
      card: 'summary_large_image',
      description,
      images: [DEFAULT_OG_IMAGE.url],
      title: titles,
    },
  };
}

interface PageMetadataOptions {
  article?: {
    publishedTime: string;
    section: string;
    tags: string[];
  };
  description: string;
  image?: OgImage;
  /** A comma-separated message, or a list. */
  keywords?: string | string[];
  lang: Locale;
  /** The locales the page exists in. Defaults to every locale. */
  locales?: readonly Locale[];
  /** The part of the URL after the locale prefix, `/` for the landing page. */
  path: string;
  /**
   * The layout's template appends the brand to a plain title. It does not
   * apply to a page that sits next to the layout, such as the landing page.
   */
  title: string | { absolute: string };
}

/**
 * A page's title, description, canonical URL, hreflang alternates and share
 * cards. Next replaces the layout's `openGraph` and `twitter` objects with a
 * page's own, so both always carry an image.
 */
export function pageMetadata({
  article,
  description,
  image = DEFAULT_OG_IMAGE,
  keywords,
  lang,
  locales = routing.locales,
  path,
  title,
}: PageMetadataOptions): Metadata {
  const url = localeUrl(lang, path);
  // A title that already names the site skips the layout's brand suffix.
  const pageTitle =
    typeof title === 'string' && title.endsWith(SITE_NAME)
      ? { absolute: title }
      : title;
  const xDefaultLocale = locales.includes(routing.defaultLocale)
    ? routing.defaultLocale
    : locales[0];
  const openGraph = {
    description,
    images: [image],
    locale: lang,
    siteName: SITE_NAME,
    title: pageTitle,
    url,
  };

  return {
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(
          locales.map((locale) => [locale, localeUrl(locale, path)]),
        ),
        'x-default': localeUrl(xDefaultLocale, path),
      },
    },
    description,
    ...(keywords && {
      keywords:
        typeof keywords === 'string'
          ? keywords.split(',').map((keyword) => keyword.trim())
          : keywords,
    }),
    openGraph: article
      ? { ...openGraph, ...article, type: 'article' }
      : { ...openGraph, type: 'website' },
    title: pageTitle,
    twitter: {
      card: 'summary_large_image',
      description,
      images: [image.url],
      title: pageTitle,
    },
  };
}
