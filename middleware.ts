export { auth as middleware } from './auth'

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - android-chrome-192x192.png
     * - android-chrome-384x384.png
     * - apple-touch-icon.png
     * - favicon-16x16.png
     * - favicon-32x32.png
     * FIXME: find regex -https://github.com/pillarjs/path-to-regexp
     * - site.webmanifest
     */
    '/((?!api|_next/static|_next/image|images|favicon.ico|android-chrome-192x192.png|android-chrome-384x384.png|apple-touch-icon.png|favicon-16x16.png|favicon-32x32.png|site.webmanifest).*)'
  ]
}
