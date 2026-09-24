import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ADMIN_SESSION_COOKIE, resolveAdminAccess } from '@/lib/auth/admin-access';

export class AdminRequiredError extends Error {
  readonly status = 401;
  constructor() {
    super('Admin authorization required');
  }
}

/**
 * True when the current request belongs to an admin (see admin-access.ts for
 * the rules). Memoized per server render.
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();
  return resolveAdminAccess(cookieStore.get(ADMIN_SESSION_COOKIE)?.value, supabase);
});

/**
 * Throws AdminRequiredError unless the current request belongs to an admin.
 * Call at the top of every route handler / server action that writes data.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new AdminRequiredError();
}
