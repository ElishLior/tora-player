'use server';

import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { routing } from '@/i18n/routing';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  getAdminPasswordConfig,
} from '@/lib/auth/admin-access';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { emailSchema, otpCodeSchema } from '@/lib/validators';

/** Error codes are translated by the UI via the `auth.errors` messages. */
export type AuthErrorCode =
  | 'invalid_email'
  | 'invalid_code'
  | 'rate_limited'
  | 'unavailable'
  | 'send_failed'
  | 'code_rejected'
  | 'google_unavailable'
  | 'password_disabled'
  | 'wrong_password';

type ActionResult = { ok: true } | { ok: false; error: AuthErrorCode };

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const passwordAttemptsPerIp = createRateLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES });
const passwordAttemptsTotal = createRateLimiter({ limit: 30, windowMs: FIFTEEN_MINUTES });
const codeRequestsPerIp = createRateLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES });
const codeRequestsPerEmail = createRateLimiter({ limit: 3, windowMs: FIFTEEN_MINUTES });
const codeVerificationsPerEmail = createRateLimiter({ limit: 8, windowMs: FIFTEEN_MINUTES });
const oauthStartsPerIp = createRateLimiter({ limit: 20, windowMs: FIFTEEN_MINUTES });

/** Origin for auth redirect links; Supabase additionally checks its redirect allow-list. */
async function getAppOrigin(): Promise<string> {
  const origin = (await headers()).get('origin');
  if (origin && /^https?:\/\/[^/\s]+$/.test(origin)) return origin;
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function buildCallbackUrl(locale: string, next: string | undefined): Promise<string> {
  const safeLocale = routing.locales.includes(locale as 'he' | 'en') ? locale : routing.defaultLocale;
  const nextPath = safeRedirectPath(next, `/${safeLocale}`);
  return `${await getAppOrigin()}/${safeLocale}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

// ==================== ADMIN PASSWORD (fallback) ====================

/**
 * Password login for the admin area. Enabled only while ADMIN_PASSWORD and
 * ADMIN_SESSION_SECRET are set; issues a signed, expiring session token.
 */
export async function loginAdmin(password: string): Promise<{ success: boolean; error?: AuthErrorCode }> {
  const config = getAdminPasswordConfig();
  if (!config) {
    return { success: false, error: 'password_disabled' };
  }

  const ip = getClientIp(await headers());
  if (!passwordAttemptsPerIp.consume(ip) || !passwordAttemptsTotal.consume('*')) {
    return { success: false, error: 'rate_limited' };
  }

  const matches =
    typeof password === 'string' &&
    timingSafeEqual(
      createHash('sha256').update(password).digest(),
      createHash('sha256').update(config.password).digest(),
    );
  if (!matches) {
    return { success: false, error: 'wrong_password' };
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, await createAdminSessionToken(config), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return { success: true };
}

// ==================== SUPABASE AUTH ====================

export async function sendSignInCode(email: string, locale: string, next?: string): Promise<ActionResult> {
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) return { ok: false, error: 'invalid_email' };

  const ip = getClientIp(await headers());
  if (!codeRequestsPerIp.consume(ip) || !codeRequestsPerEmail.consume(parsedEmail.data)) {
    return { ok: false, error: 'rate_limited' };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: 'unavailable' };

  const { error } = await supabase.auth.signInWithOtp({
    email: parsedEmail.data,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: await buildCallbackUrl(locale, next),
    },
  });
  if (error) {
    console.error('[auth] signInWithOtp failed:', error.status, error.message);
    return {
      ok: false,
      error: error.status === 429 ? 'rate_limited' : 'send_failed',
    };
  }
  return { ok: true };
}

export async function verifySignInCode(email: string, code: string): Promise<ActionResult> {
  const parsedEmail = emailSchema.safeParse(email);
  const parsedCode = otpCodeSchema.safeParse(code);
  if (!parsedEmail.success || !parsedCode.success) return { ok: false, error: 'invalid_code' };

  if (!codeVerificationsPerEmail.consume(parsedEmail.data)) {
    return { ok: false, error: 'rate_limited' };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: 'unavailable' };

  const { error } = await supabase.auth.verifyOtp({
    email: parsedEmail.data,
    token: parsedCode.data,
    type: 'email',
  });
  if (error) {
    return {
      ok: false,
      error: error.status === 429 ? 'rate_limited' : 'code_rejected',
    };
  }
  return { ok: true };
}

/** Starts Google OAuth (PKCE); the client navigates to the returned URL. */
export async function startGoogleSignIn(
  locale: string,
  next?: string,
): Promise<{ url: string } | { error: AuthErrorCode }> {
  if (!oauthStartsPerIp.consume(getClientIp(await headers()))) return { error: 'rate_limited' };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: 'unavailable' };

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: await buildCallbackUrl(locale, next),
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error || !data.url) {
    console.error('[auth] signInWithOAuth failed:', error?.message);
    return { error: 'google_unavailable' };
  }
  return { url: data.url };
}

/** Ends both the Supabase session and any admin password session. */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut({ scope: 'local' });
  (await cookies()).delete(ADMIN_SESSION_COOKIE);
}
