import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const COOKIE_NAME = 'tora-admin-token';

// Check if a path requires admin auth
function isProtectedPath(pathname: string): boolean {
  // Strip locale prefix (e.g., /he/ or /en/)
  const pathWithoutLocale = pathname.replace(/^\/(he|en)/, '');

  // Admin routes (except login)
  if (pathWithoutLocale.startsWith('/admin') && !pathWithoutLocale.startsWith('/admin/login')) {
    return true;
  }

  // Upload page
  if (pathWithoutLocale.startsWith('/lessons/upload')) {
    return true;
  }

  // Edit pages
  if (pathWithoutLocale.endsWith('/edit')) {
    return true;
  }

  return false;
}

// Extract locale from path
function getLocaleFromPath(pathname: string): string {
  const match = pathname.match(/^\/(he|en)/);
  return match ? match[1] : 'he';
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check admin protection before i18n middleware
  if (isProtectedPath(pathname)) {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      const locale = getLocaleFromPath(pathname);
      const loginUrl = new URL(`/${locale}/admin/login`, request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Token exists -- verify it matches the expected hash
    // We use Web Crypto API since middleware runs in Edge runtime
    const adminPassword = (process.env.ADMIN_PASSWORD || 'admin123').trim();
    const encoder = new TextEncoder();
    const data = encoder.encode(adminPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedToken = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (token !== expectedToken) {
      const locale = getLocaleFromPath(pathname);
      const loginUrl = new URL(`/${locale}/admin/login`, request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Run i18n middleware for all matched routes
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(he|en)/:path*'],
};
