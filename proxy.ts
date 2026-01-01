import { match as matchLocale } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';
import { i18n } from './lib/i18n/i18n-config';

// Determines the best matching locale based on the request's Accept-Language headers
function getLocale(request: NextRequest): string {
  const negotiatorHeaders = Object.fromEntries(
    Array.from(request.headers.entries()).map(([key, value]) => [key, value]),
  );

  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();

  return matchLocale(languages, i18n.locales, i18n.defaultLocale);
}

function getLocaleFromPathname(request: NextRequest): string {
  const pathname = request.nextUrl.pathname;
  const potentialLocale = pathname.split('/')[1] ?? '';
  if ((i18n.locales as readonly string[]).includes(potentialLocale)) {
    return potentialLocale;
  }
  return i18n.defaultLocale;
}

const publicRoutesWithoutAuth = [
  '/api/stripe/webhook',
  '/api/daily-stats',
  '/api/inngest',
];

const publicRoutesWithLang = (locales: readonly string[]) =>
  locales.flatMap((locale) => [
    `/${locale}/wrapped`,
    `/${locale}/privacy-policy`,
    `/${locale}/terms`,
  ]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (publicRoutesWithoutAuth.includes(pathname)) {
    return NextResponse.next();
  }

  if (publicRoutesWithLang(i18n.locales).includes(pathname)) {
    return NextResponse.next();
  }

  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) =>
      !(
        pathname.startsWith(`/${locale}/`) ||
        pathname.startsWith('/auth') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/webhook')
      ) && pathname !== `/${locale}`,
  );

  // console.log({ pathnameIsMissingLocale, pathname });

  // Redirect if there is no locale in the path
  if (pathnameIsMissingLocale) {
    try {
      // get the locale from the headers
      const locale = getLocale(req);
      return NextResponse.redirect(new URL(`/${locale}${pathname}`, req.url));
    } catch (_error) {
      if (pathname === '/') {
        return NextResponse.redirect(new URL('/en', req.url));
      }
      return NextResponse.redirect(new URL(`/en${pathname}`, req.url));
    }
  }

  const locale = getLocaleFromPathname(req);

  return await updateSession(req, locale);
}
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - ingest (Posthog rewrites)
     * - favicon.ico (favicon file)
     * - robots.txt (robots file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .ico, .webp
     * - audio - .mp3
     * - sitemap - xml
     * - scripts - .js (for botid client-side library)
     * - /{2-letter-lang}/blog/* paths
     * - /{2-letter-lang}/tools/* paths=
     * - /manifest.json
     */
    '/((?!_next/static|ingest|_next/image|favicon.ico|robots\\.txt|[a-z]{2}/blog/|[a-z]{2}/tools/|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp|mp3|xml|js)$).*)',
  ],
  missing: [
    { type: 'header', key: 'next-router-prefetch' },
    { type: 'header', key: 'purpose', value: 'prefetch' },
  ],
};
