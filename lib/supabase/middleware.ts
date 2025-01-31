import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from './server';

const publicRoutes = ['/', '/auth/callback'];

export const updateSession = async (request: NextRequest) => {
  try {
    const supabaseResponse = NextResponse.next({
      request,
    });

    const supabase = createClient();

    // const isPublicRoute = publicRoutes.includes(request.nextUrl.pathname)

    // if (!session && !isPublicRoute) {
    //   // If there's no session and trying to access a protected route,
    //   // redirect to the login page
    //   return NextResponse.redirect(new URL('/', request.url))
    // }

    // if (session && request.nextUrl.pathname === '/') {
    //   // If there's a session and trying to access login page,
    //   // redirect to the dashboard
    //   return NextResponse.redirect(new URL('/branding-analysis', request.url))
    // }

    // return response
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (
      !user &&
      !request.nextUrl.pathname.startsWith('/') &&
      !request.nextUrl.pathname.startsWith('/auth')
    ) {
      // no user, potentially respond by redirecting the user to the login page
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
    // creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely!

    return supabaseResponse;
  } catch (e) {
    console.error('Middleware error:', e);
    return NextResponse.redirect(new URL('/', request.url));
  }
};
