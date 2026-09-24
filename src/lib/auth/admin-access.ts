import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Edge-safe admin access primitives (Web Crypto only), shared by
 * src/middleware.ts and the server-side isAdmin() in src/lib/auth/admin.ts.
 *
 * An admin is either
 *  - a signed-in Supabase user with a confirmed email listed in ADMIN_EMAILS,
 *  - a signed-in Supabase user whose profiles.role is 'admin', or
 *  - a holder of a valid password session cookie. The password fallback only
 *    exists while ADMIN_PASSWORD and ADMIN_SESSION_SECRET are both configured.
 */

export const ADMIN_SESSION_COOKIE = 'tora-admin-session';
export const ADMIN_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

const TOKEN_VERSION = 'v1';
const MIN_SECRET_LENGTH = 32;
const encoder = new TextEncoder();

type Env = Partial<Record<string, string | undefined>>;

export interface AdminPasswordConfig {
  password: string;
  secret: string;
}

/** Password login is enabled only when both env vars are set (secret ≥ 32 chars). */
export function getAdminPasswordConfig(env: Env = process.env): AdminPasswordConfig | null {
  const password = env.ADMIN_PASSWORD?.trim();
  const secret = env.ADMIN_SESSION_SECRET?.trim();
  if (!password || !secret || secret.length < MIN_SECRET_LENGTH) return null;
  return { password, secret };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * The signing key mixes in the password, so changing ADMIN_PASSWORD (or
 * rotating ADMIN_SESSION_SECRET) invalidates every outstanding session.
 */
function importSigningKey(config: AdminPasswordConfig): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`${config.secret}\u0000${config.password}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Token format: `v1.<expiry unix seconds>.<random nonce>.<HMAC-SHA256 signature>` (base64url). */
export async function createAdminSessionToken(
  config: AdminPasswordConfig,
  nowMs: number = Date.now(),
): Promise<string> {
  const expiresAt = Math.floor(nowMs / 1000) + ADMIN_SESSION_TTL_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${TOKEN_VERSION}.${expiresAt}.${nonce}`;
  const key = await importSigningKey(config);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Constant-time signature check (crypto.subtle.verify) plus expiry check. */
export async function verifyAdminSessionToken(
  token: string,
  config: AdminPasswordConfig,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= nowMs) return false;

  const signature = fromBase64Url(parts[3]);
  if (!signature || !parts[2]) return false;

  const key = await importSigningKey(config);
  return crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    encoder.encode(`${parts[0]}.${parts[1]}.${parts[2]}`),
  );
}

export function isAdminEmail(email: string | null | undefined, env: Env = process.env): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry.length > 0 && entry === normalized);
}

/**
 * Resolves admin access from the password-session cookie value and/or the
 * request's Supabase session. `supabase` must be a cookie-bound client for the
 * current request (never the service-role client).
 */
export async function resolveAdminAccess(
  sessionToken: string | undefined,
  supabase: SupabaseClient | null,
  env: Env = process.env,
): Promise<boolean> {
  const passwordConfig = getAdminPasswordConfig(env);
  if (passwordConfig && sessionToken && (await verifyAdminSessionToken(sessionToken, passwordConfig))) {
    return true;
  }

  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  if (user.email_confirmed_at && isAdminEmail(user.email, env)) return true;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return profile?.role === 'admin';
}
