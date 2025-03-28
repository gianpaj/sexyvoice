import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { i18n } from './lib/i18n/i18n-config';
import { match as matchLocale } from '@formatjs/intl-localematcher';
import { updateSession } from '@/lib/supabase/middleware';
import Negotiator from 'negotiator';

function getLocale(request: NextRequest): string {
  const negotiatorHeaders = Object.fromEntries(
    Array.from(request.headers.entries()).map(([key, value]) => [key, value]),
  );

  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();

  return matchLocale(languages, i18n.locales, i18n.defaultLocale);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) =>
      !pathname.startsWith(`/${locale}/`) &&
      !pathname.startsWith('/auth') &&
      !pathname.startsWith('/api') &&
      !pathname.startsWith('/webhook') &&
      pathname !== `/${locale}`,
  );

  // console.log({ pathnameIsMissingLocale });

  // Redirect if there is no locale
  if (pathnameIsMissingLocale) {
    try {
      const locale = getLocale(req);
      return NextResponse.redirect(new URL(`/${locale}${pathname}`, req.url));
    } catch (error) {
      if (pathname === '/') {
        return NextResponse.redirect(new URL('/en', req.url));
      }
      return NextResponse.redirect(new URL(`/en${pathname}`, req.url));
    }
  }

  return await updateSession(req);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - ingest (Posthug rewrites)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - audio - .mp3
     */
    '/((?!_next/static|ingest|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)',
  ],
};
