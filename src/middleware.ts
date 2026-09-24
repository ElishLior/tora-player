import createMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { ADMIN_SESSION_COOKIE, resolveAdminAccess } from '@/lib/auth/admin-access';

const intlMiddleware = createMiddleware(routing);

// Admin-only pages (API routes and server actions authorize themselves).
function isProtectedPath(pathname: string): boolean {
  const path = pathname.replace(/^\/(he|en)(?=\/|$)/, '');
  return (
    (path.startsWith('/admin') && !path.startsWith('/admin/login')) ||
    path.startsWith('/lessons/upload') ||
    path.endsWith('/edit')
  );
}

export default async function middleware(request: NextRequest) {
  const refreshedCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Refresh the Supabase session before rendering. Updated tokens are written
  // to the request (next-intl forwards request headers to the page) and to the
  // response (Set-Cookie for the browser).
  const supabase =
    supabaseUrl && supabaseKey
      ? createServerClient(supabaseUrl, supabaseKey, {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll(cookiesToSet) {
              for (const cookie of cookiesToSet) {
                request.cookies.set(cookie.name, cookie.value);
                refreshedCookies.push(cookie);
              }
            },
          },
        })
      : null;

  // A Supabase outage must not take every page down; pages then render signed-out.
  if (supabase) await supabase.auth.getClaims().catch(() => undefined);

  let response: NextResponse;
  if (
    isProtectedPath(request.nextUrl.pathname) &&
    !(await resolveAdminAccess(request.cookies.get(ADMIN_SESSION_COOKIE)?.value, supabase))
  ) {
    const locale = request.nextUrl.pathname.match(/^\/(he|en)(?=\/|$)/)?.[1] ?? routing.defaultLocale;
    const loginUrl = new URL(`/${locale}/admin/login`, request.url);
    loginUrl.searchParams.set('from', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    response = NextResponse.redirect(loginUrl);
  } else {
    response = intlMiddleware(request);
  }

  for (const { name, value, options } of refreshedCookies) {
    response.cookies.set(name, value, options);
  }
  if (refreshedCookies.length > 0) {
    // Never let a CDN cache a response that carries session cookies.
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

export const config = {
  matcher: ['/', '/(he|en)/:path*'],
};
