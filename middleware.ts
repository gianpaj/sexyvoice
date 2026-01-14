import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { updateSession } from '@/lib/supabase/middleware';

const publicRoutesWithoutAuth = [
  '/api/stripe/webhook',
  '/api/daily-stats',
  '/api/inngest',
];

const handleI18nRouting = createMiddleware({
  defaultLocale: i18n.defaultLocale,
  localePrefix: i18n.localePrefix,
  locales: i18n.locales,
});

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicRoutesWithoutAuth.includes(pathname)) {
    return NextResponse.next();
  }

  const i18nResponse = handleI18nRouting(request);
  const localeFromPath = (pathname.split('/')[1] || i18n.defaultLocale) as Locale;

  if (i18nResponse.headers.get('location')) {
    return i18nResponse;
  }

  return updateSession(request, localeFromPath, i18nResponse);
}

export const config = {
  matcher: [
    '/((?!_next/static|ingest|_next/image|favicon.ico|robots\\.txt|[a-z]{2}/blog/|privacy-policy|terms|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp|mp3|xml)$).*)',
  ],
  missing: [
    { type: 'header', key: 'next-router-prefetch' },
    { type: 'header', key: 'purpose', value: 'prefetch' },
  ],
};
