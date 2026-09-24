import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  getAdminPasswordConfig,
  isAdminEmail,
  resolveAdminAccess,
  verifyAdminSessionToken,
} from './admin-access';

const config = { password: 'correct horse battery staple', secret: 'x'.repeat(48) };
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

describe('admin session tokens', () => {
  it('verifies a freshly issued token until it expires', async () => {
    const token = await createAdminSessionToken(config, NOW);
    expect(await verifyAdminSessionToken(token, config, NOW + 1000)).toBe(true);
    expect(await verifyAdminSessionToken(token, config, NOW + (ADMIN_SESSION_TTL_SECONDS - 1) * 1000)).toBe(true);
    expect(await verifyAdminSessionToken(token, config, NOW + ADMIN_SESSION_TTL_SECONDS * 1000)).toBe(false);
  });

  it('issues a different token every time', async () => {
    const [a, b] = await Promise.all([createAdminSessionToken(config, NOW), createAdminSessionToken(config, NOW)]);
    expect(a).not.toBe(b);
  });

  it('rejects tokens whose expiry or nonce was altered', async () => {
    const [version, expiry, nonce, signature] = (await createAdminSessionToken(config, NOW)).split('.');
    const extended = [version, String(Number(expiry) + 365 * 24 * 3600), nonce, signature].join('.');
    const otherNonce = [version, expiry, `${nonce}A`, signature].join('.');
    expect(await verifyAdminSessionToken(extended, config, NOW)).toBe(false);
    expect(await verifyAdminSessionToken(otherNonce, config, NOW)).toBe(false);
  });

  it('rejects tokens after the password or secret changes', async () => {
    const token = await createAdminSessionToken(config, NOW);
    expect(await verifyAdminSessionToken(token, { ...config, password: 'new password' }, NOW)).toBe(false);
    expect(await verifyAdminSessionToken(token, { ...config, secret: 'y'.repeat(48) }, NOW)).toBe(false);
  });

  it('rejects malformed tokens and the legacy sha256(password) cookie', async () => {
    for (const token of ['', 'v1', 'v1.1.2', 'v2.9999999999.abc.def', 'v1.9999999999.abc.@@@', 'a'.repeat(64)]) {
      expect(await verifyAdminSessionToken(token, config, NOW)).toBe(false);
    }
  });
});

describe('getAdminPasswordConfig', () => {
  it('enables password login only with a password and a 32+ character secret', () => {
    expect(getAdminPasswordConfig({ ADMIN_PASSWORD: 'pw', ADMIN_SESSION_SECRET: 's'.repeat(32) })).toEqual({
      password: 'pw',
      secret: 's'.repeat(32),
    });
    expect(getAdminPasswordConfig({ ADMIN_PASSWORD: 'pw', ADMIN_SESSION_SECRET: 's'.repeat(31) })).toBeNull();
    expect(getAdminPasswordConfig({ ADMIN_SESSION_SECRET: 's'.repeat(32) })).toBeNull();
    expect(getAdminPasswordConfig({ ADMIN_PASSWORD: 'pw' })).toBeNull();
    expect(getAdminPasswordConfig({})).toBeNull();
  });
});

describe('isAdminEmail', () => {
  const env = { ADMIN_EMAILS: ' Lior5750@gmail.com , other@example.com,' };

  it('matches listed emails exactly, ignoring case and spaces', () => {
    expect(isAdminEmail('lior5750@GMAIL.com', env)).toBe(true);
    expect(isAdminEmail('other@example.com', env)).toBe(true);
  });

  it('does not match partial addresses, empty entries or missing config', () => {
    expect(isAdminEmail('5750@gmail.com', env)).toBe(false);
    expect(isAdminEmail('lior5750@gmail.com.evil.com', env)).toBe(false);
    expect(isAdminEmail('', env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
    expect(isAdminEmail('lior5750@gmail.com', {})).toBe(false);
  });
});

function fakeSupabase(user: { id: string; email: string; email_confirmed_at: string | null } | null, role?: string) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('resolveAdminAccess', () => {
  const env = { ADMIN_EMAILS: 'lior5750@gmail.com', ADMIN_PASSWORD: config.password, ADMIN_SESSION_SECRET: config.secret };
  const confirmed = '2026-01-01T00:00:00Z';

  it('grants a confirmed ADMIN_EMAILS user', async () => {
    const supabase = fakeSupabase({ id: 'u1', email: 'lior5750@gmail.com', email_confirmed_at: confirmed });
    expect(await resolveAdminAccess(undefined, supabase, env)).toBe(true);
  });

  it('refuses an ADMIN_EMAILS address whose email is not confirmed', async () => {
    const supabase = fakeSupabase({ id: 'u1', email: 'lior5750@gmail.com', email_confirmed_at: null });
    expect(await resolveAdminAccess(undefined, supabase, env)).toBe(false);
  });

  it('grants users whose profile role is admin and refuses ordinary users', async () => {
    const user = { id: 'u2', email: 'someone@example.com', email_confirmed_at: confirmed };
    expect(await resolveAdminAccess(undefined, fakeSupabase(user, 'admin'), env)).toBe(true);
    expect(await resolveAdminAccess(undefined, fakeSupabase(user, 'user'), env)).toBe(false);
    expect(await resolveAdminAccess(undefined, fakeSupabase(null), env)).toBe(false);
  });

  it('accepts a valid password session only while password login is configured', async () => {
    const token = await createAdminSessionToken(config);
    expect(await resolveAdminAccess(token, null, env)).toBe(true);
    expect(await resolveAdminAccess(token, null, { ADMIN_EMAILS: env.ADMIN_EMAILS })).toBe(false);
    expect(await resolveAdminAccess('forged', null, env)).toBe(false);
  });
});
