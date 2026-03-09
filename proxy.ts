import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { updateSession } from '@/lib/supabase/middleware';

const publicRoutesWithoutAuth = [
  '/api/stripe/webhook',
  '/api/daily-stats',
  '/api/inngest',
  '/api/health',
];

const publicRoutesWithLang = (locales: readonly string[]) =>
  locales.flatMap((locale) => [
    `/${locale}/wrapped`,
    `/${locale}/privacy-policy`,
    `/${locale}/terms`,
  ]);

const handleI18nRouting = createMiddleware({
  defaultLocale: i18n.defaultLocale,
  localePrefix: i18n.localePrefix,
  locales: i18n.locales,
});

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicRoutesWithoutAuth.includes(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/v1')) {
    return NextResponse.next();
  }

  if (publicRoutesWithLang(i18n.locales).includes(pathname)) {
    return NextResponse.next();
  }

  const i18nResponse = handleI18nRouting(request);
  if (i18nResponse.headers.get('location')) {
    return i18nResponse;
  }

  const localeFromPath = (pathname.split('/')[1] || i18n.defaultLocale) as Locale;

  if (pathname === `/${localeFromPath}` || pathname === `/${localeFromPath}/`) {
    return i18nResponse;
  }

  return updateSession(request, localeFromPath, i18nResponse);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|seguimiento|monitoring|favicon\\.ico|robots\\.txt|manifest\\.json|[a-z]{2}/blog/|[a-z]{2}/tools/|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp|mp3|xml)$).*)',
  ],
  missing: [
    { type: 'header', key: 'next-router-prefetch' },
    { type: 'header', key: 'purpose', value: 'prefetch' },
  ],
};
