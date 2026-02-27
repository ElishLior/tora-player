'use server';

import { cookies } from 'next/headers';
import { createHash } from 'crypto';

const COOKIE_NAME = 'tora-admin-token';
const VISIBLE_COOKIE_NAME = 'tora-admin-visible';

function getAdminPassword(): string {
  return (process.env.ADMIN_PASSWORD || 'admin123').trim();
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export async function loginAdmin(password: string): Promise<{ success: boolean; error?: string }> {
  const adminPassword = getAdminPassword();

  if (password !== adminPassword) {
    return { success: false, error: 'סיסמה שגויה' };
  }

  const token = hashPassword(adminPassword);
  const cookieStore = await cookies();

  // Set httpOnly auth cookie (secure, not accessible from JS)
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  // Set non-httpOnly visible cookie (for client-side UI checks)
  cookieStore.set(VISIBLE_COOKIE_NAME, '1', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return { success: true };
}

export async function logoutAdmin(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(VISIBLE_COOKIE_NAME);
}

export async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  const expectedToken = hashPassword(getAdminPassword());
  return token === expectedToken;
}
