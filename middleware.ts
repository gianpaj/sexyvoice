export { auth as middleware } from './auth'

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|images|favicon.ico|favicon-16x16.png).*)'
  ]
}
