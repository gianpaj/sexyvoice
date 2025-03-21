import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from './server';
import { i18n } from '@/lib/i18n/i18n-config';

const routesPerLocale = (routes: string[]): string[] => {
  return i18n.locales.flatMap((locale) =>
    routes.flatMap((route) =>
      route === '/' ? [`/${locale}`, `/${locale}/`] : `/${locale}${route}`,
    ),
  );
};

const publicRoutes = [
  '/api/generate-voice',
  '/auth/callback',
  ...routesPerLocale(['/', '/signup', '/login']),
];

export const updateSession = async (request: NextRequest) => {
  try {
    const { pathname } = request.nextUrl;
    const supabaseResponse = NextResponse.next({
      request,
    });

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isPublicRoute = publicRoutes.includes(pathname);

    if (!user && pathname.includes('/dashboard')) {
      // no user, potentially respond by redirecting the user to the login page
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    if (!user && !isPublicRoute) {
      // If there's no session and trying to access a protected route,
      // redirect to the login page
      return NextResponse.redirect(new URL('/', request.url));
    }

    const authRoutes = routesPerLocale(['/signup', '/login']);

    if (user && authRoutes.includes(pathname)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
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
