import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import type { Locale } from '@/lib/i18n/i18n-config';
import { updateSession } from '@/lib/supabase/middleware';
import { routing } from './src/i18n/routing';

const publicRoutesWithLang = (locales: readonly string[]) =>
  locales.flatMap((locale) => [
    `/${locale}/wrapped`,
    `/${locale}/privacy-policy`,
    `/${locale}/privacy-policy.md`,
    `/${locale}/terms`,
    `/${locale}/terms.md`,
    `/${locale}/blog`,
    `/${locale}/blog.md`,
    `/${locale}/index.md`,
  ]);

const isLocalizedBlogPostPath = (pathname: string) => {
  const match = pathname.match(/^\/([a-z]{2})\/blog\/([^/]+)$/);

  if (!match) {
    return false;
  }

  const [, lang] = match;
  return routing.locales.includes(lang as Locale);
};

const isExplicitMarkdownAccept = (acceptHeader: string) =>
  acceptHeader
    .split(',')
    .some((part) => part.trim().toLowerCase().startsWith('text/markdown'));

const handleI18nRouting = createMiddleware(routing);

const getMarkdownBlogSlug = (pathname: string) => {
  const match = pathname.match(/^\/([a-z]{2})\/blog\/([^/]+)\.md$/);

  if (!match) {
    return null;
  }

  const [, lang, slug] = match;

  if (!routing.locales.includes(lang as Locale)) {
    return null;
  }

  return { lang, slug };
};

const getMarkdownLocalePath = (pathname: string) => {
  const localeMatch = pathname.match(
    /^\/([a-z]{2})(?:\/(blog|privacy-policy|terms))?$/,
  );

  if (!localeMatch) {
    return null;
  }

  const [, lang, section] = localeMatch;

  if (!routing.locales.includes(lang as Locale)) {
    return null;
  }

  if (!section) {
    return `/${lang}/index.md`;
  }

  if (section === 'blog') {
    return `/${lang}/blog.md`;
  }

  return `/${lang}/${section}.md`;
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const acceptHeader = request.headers.get('accept') ?? '';
  const markdownBlogSlug = getMarkdownBlogSlug(pathname);
  const explicitMarkdownAccept = isExplicitMarkdownAccept(acceptHeader);
  const markdownLocalePath = explicitMarkdownAccept
    ? getMarkdownLocalePath(pathname)
    : null;

  if (
    pathname === '/auth/callback' ||
    pathname.startsWith('/markdown-internal/')
  ) {
    return NextResponse.next();
  }

  if (markdownBlogSlug) {
    const url = request.nextUrl.clone();
    url.pathname = `/markdown-internal/blog/${markdownBlogSlug.lang}/${markdownBlogSlug.slug}`;
    return NextResponse.rewrite(url);
  }

  if (markdownLocalePath) {
    const url = request.nextUrl.clone();
    url.pathname = markdownLocalePath;
    return NextResponse.rewrite(url);
  }

  if (explicitMarkdownAccept) {
    const blogMatch = pathname.match(/^\/([a-z]{2})\/blog\/([^/]+)$/);

    if (blogMatch) {
      const [, lang, slug] = blogMatch;

      if (routing.locales.includes(lang as Locale)) {
        const url = request.nextUrl.clone();
        url.pathname = `/markdown-internal/blog/${lang}/${slug}`;
        return NextResponse.rewrite(url);
      }
    }
  }

  if (
    publicRoutesWithLang(routing.locales).includes(pathname) ||
    isLocalizedBlogPostPath(pathname)
  ) {
    return NextResponse.next();
  }

  const i18nResponse = handleI18nRouting(request);
  if (i18nResponse.headers.get('location')) {
    return i18nResponse;
  }

  const localeFromPath = (pathname.split('/')[1] ||
    routing.defaultLocale) as Locale;

  if (pathname === `/${localeFromPath}` || pathname === `/${localeFromPath}/`) {
    return i18nResponse;
  }

  return await updateSession(request, localeFromPath, i18nResponse);
}

export const config = {
  matcher: [
    '/((?!api/|markdown-internal/|_next/static|_next/image|seguimiento|monitoring|favicon\\.ico|robots\\.txt|manifest\\.json|[a-z]{2}/tools/|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp|mp3|xml)$).*)',
    // Note: api/ is excluded above so next-intl never locale-redirects fetch calls
  ],
  missing: [
    { type: 'header', key: 'next-router-prefetch' },
    { type: 'header', key: 'purpose', value: 'prefetch' },
  ],
};
