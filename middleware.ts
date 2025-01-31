import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { i18n } from './lib/i18n/i18n-config'
import { match as matchLocale } from '@formatjs/intl-localematcher'
import { updateSession } from '@/lib/supabase/middleware'
import Negotiator from 'negotiator'

function getLocale(request: NextRequest): string {
  const negotiatorHeaders: Record<string, string> = {}
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value))

  const languages = new Negotiator({ headers: negotiatorHeaders }).languages()
  const locales = i18n.locales

  return matchLocale(languages, locales, i18n.defaultLocale)
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname

  // Check if the pathname is missing a locale
  const pathnameIsMissingLocale = i18n.locales.every(
    locale => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  )

  // Redirect if there is no locale
  if (pathnameIsMissingLocale) {
    const locale = getLocale(req)
    return NextResponse.redirect(new URL(`/${locale}${pathname}`, req.url))
  }

  // Get the pathname without the locale
  const pathnameWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '')

  // Protect routes that require authentication
  // if (!session && (
  //   pathnameWithoutLocale.startsWith('/dashboard') ||
  //   pathnameWithoutLocale.startsWith('/profile')
  // )) {
  //   const locale = pathname.split('/')[1]
  //   return NextResponse.redirect(new URL(`/${locale}/login`, req.url))
  // }

  // // If user is logged in, redirect away from auth pages
  // if (session && (
  //   pathnameWithoutLocale.startsWith('/login') ||
  //   pathnameWithoutLocale.startsWith('/signup')
  // )) {
  //   const locale = pathname.split('/')[1]
  //   return NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url))
  // }

  return await updateSession(req)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}
