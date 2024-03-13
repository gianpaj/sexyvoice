export { auth as middleware } from './auth'

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - *.png
     * - *.jpg
     * - site.webmanifest
     */
    '/((?!api|_next/static|_next/image|images|favicon.ico|.*\\.png$|.*\\.jpg$|site.webmanifest).*)'
  ]
}
