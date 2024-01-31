import NextAuth, { type DefaultSession } from 'next-auth'
import GitHub from 'next-auth/providers/github'

declare module 'next-auth' {
  interface Session {
    user: {
      /** The user's id. */
      id: number
    } & DefaultSession['user']
  }
}

export const {
  handlers: { GET, POST },
  auth
} = NextAuth({
  providers: [GitHub],
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        token.id = profile.id
        token.image = profile.avatar_url || profile.picture
      }
      return token
    },
    // @ts-ignore
    session: ({ session, token }) => {
      if (session?.user && token?.id) {
        // @ts-ignore
        session.user.id = String(token.id)
      }
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user

      if (nextUrl.pathname.startsWith('/upload')) {
        // only allow Gianfranco to upload images
        if (!isLoggedIn || !['899175'].includes(auth?.user?.id)) {
          const redirectUrl = new URL('sign-in', nextUrl.origin)
          redirectUrl.searchParams.append('callbackUrl', nextUrl.href)
          return Response.redirect(redirectUrl)
        }
      }
      return isLoggedIn // this ensures there is a logged in user for -every- request
    }
  },
  pages: {
    signIn: '/sign-in' // overrides the next-auth default signin page https://authjs.dev/guides/basics/pages
  }
})
