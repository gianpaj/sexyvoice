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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) =>
      !(
        pathname.startsWith(`/${locale}/`) ||
        pathname.startsWith('/auth') ||
        pathname.startsWith('/privacy-policy') ||
        pathname.startsWith('/terms') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/sitemap') ||
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

  if (publicRoutesWithoutAuth.includes(pathname)) {
    return NextResponse.next();
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
     * - ingest (Posthug rewrites)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .ico, .webp
     * - audio - .mp3
     * - sitemap - xml
     * - /{2-letter-lang}/blog/* paths
     * - /privacy-policy
     * - /terms
     * - /manifest.json
     */
    '/((?!_next/static|ingest|_next/image|favicon.ico|[a-z]{2}/blog/|privacy-policy|terms|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp|mp3|xml)$).*)',
  ],
  missing: [
    { type: 'header', key: 'next-router-prefetch' },
    { type: 'header', key: 'purpose', value: 'prefetch' },
  ],
};
