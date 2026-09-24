import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { routing } from '@/i18n/routing';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const EMAIL_OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'];

/**
 * Landing URL for Google OAuth and email links:
 *  - `?code=` (PKCE: OAuth, or a magic link opened in the same browser)
 *  - `?token_hash=&type=` (email template link; works in any browser)
 * Session cookies are set on the redirect response.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = routing.locales.includes(rawLocale as 'he' | 'en') ? rawLocale : routing.defaultLocale;
  const { searchParams } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get('next'), `/${locale}`);

  const failure = (reason: string) => {
    const url = new URL(`/${locale}/auth/sign-in`, request.url);
    url.searchParams.set('error', reason);
    url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  };

  if (searchParams.get('error')) return failure('provider');

  const supabase = await createServerSupabaseClient();
  if (!supabase) return failure('unavailable');

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  let error: { message: string } | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type && EMAIL_OTP_TYPES.includes(type)) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    return failure('invalid_link');
  }

  if (error) {
    console.error('[auth] callback failed:', error.message);
    return failure('expired');
  }
  return NextResponse.redirect(new URL(next, request.url));
}
