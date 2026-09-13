import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export function createMiddlewareClient(
  request: NextRequest,
  response: NextResponse,
) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }

          // Forward refreshed cookies to the render without replacing the
          // locale rewrite or its request-header overrides.
          const forwarded = NextResponse.next({ request });
          const overrides = new Set(
            (response.headers.get('x-middleware-override-headers') ?? '')
              .split(',')
              .map((name) => name.trim())
              .filter(Boolean),
          );
          for (const name of (
            forwarded.headers.get('x-middleware-override-headers') ?? ''
          ).split(',')) {
            if (!name) continue;
            const header = `x-middleware-request-${name}`;
            if (name === 'cookie' || !response.headers.has(header)) {
              response.headers.set(header, forwarded.headers.get(header)!);
            }
            overrides.add(name);
          }
          response.headers.set(
            'x-middleware-override-headers',
            [...overrides].join(','),
          );

          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value);
          }
        },
      },
    },
  );
}

export function copyAuthResponse(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  for (const name of ['cache-control', 'expires', 'pragma']) {
    const value = source.headers.get(name);
    if (value !== null) target.headers.set(name, value);
  }
  return target;
}
