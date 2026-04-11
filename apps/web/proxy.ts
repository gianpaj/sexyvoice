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
    `/${locale}/terms`,
    `/${locale}/blog`,
  ]);

const handleI18nRouting = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/auth/callback') {
    return NextResponse.next();
  }

  if (publicRoutesWithLang(routing.locales).includes(pathname)) {
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
    '/((?!api/|_next/static|_next/image|seguimiento|monitoring|favicon\\.ico|robots\\.txt|manifest\\.json|[a-z]{2}/blog/|[a-z]{2}/tools/|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp|mp3|xml)$).*)',
    // Note: api/ is excluded above so next-intl never locale-redirects fetch calls
  ],
  missing: [
    { type: 'header', key: 'next-router-prefetch' },
    { type: 'header', key: 'purpose', value: 'prefetch' },
  ],
};
