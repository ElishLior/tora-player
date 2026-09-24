'use server';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { z } from 'zod';
import { getSignedInClient } from '@/lib/account/server';
import { isAdmin, requireAdmin } from '@/lib/auth/admin';
import { isAdminEmail } from '@/lib/auth/admin-access';
import { parseUsersQuery, queryUsers, type AdminUserRow, type UsersQuery } from '@/lib/admin-insights';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const AUTH_PAGE_SIZE = 1000;
// PostgREST returns at most 1000 rows per request (Supabase default max-rows).
const DB_PAGE_SIZE = 1000;

export interface AdminUsersPage {
  query: UsersQuery;
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageCount: number;
  /** The signed-in admin's own user id (null for password-session admins). */
  currentUserId: string | null;
}

export type AdminUserActionResult =
  | { ok: true }
  | { ok: false; error: 'unauthorized' | 'invalid' | 'cannot_demote_self' | 'failed' };

async function listAllAuthUsers(supabase: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < AUTH_PAGE_SIZE) return users;
  }
}

async function selectAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + DB_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < DB_PAGE_SIZE) return rows;
  }
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  role: 'user' | 'admin';
  notify_new_lessons: boolean;
}

interface ActivityRow {
  user_id: string;
  listens: number;
  listened_seconds: number;
  last_listen_at: string | null;
  push_subscriptions: number;
}

/** Admin only: one page of the users table (auth users + profile + activity). */
export async function getAdminUsers(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<AdminUsersPage> {
  await requireAdmin();
  const query = parseUsersQuery(searchParams ?? {});
  const supabase = createAdminSupabaseClient();

  const [authUsers, profiles, activity, session] = await Promise.all([
    listAllAuthUsers(supabase),
    selectAll<ProfileRow>((from, to) =>
      supabase.from('profiles').select('id, display_name, role, notify_new_lessons').order('id').range(from, to),
    ),
    selectAll<ActivityRow>((from, to) =>
      supabase.rpc('admin_user_activity').order('user_id').range(from, to),
    ),
    getSignedInClient(),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const activityById = new Map(activity.map((row) => [row.user_id, row]));

  const rows: AdminUserRow[] = authUsers.map((user) => {
    const profile = profileById.get(user.id);
    const stats = activityById.get(user.id);
    const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
    return {
      id: user.id,
      email: user.email ?? null,
      displayName: profile?.display_name ?? (typeof metadataName === 'string' ? metadataName : null),
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      lastListenAt: stats?.last_listen_at ?? null,
      listens: Number(stats?.listens ?? 0),
      listenedSeconds: Number(stats?.listened_seconds ?? 0),
      notifyNewLessons: profile?.notify_new_lessons ?? true,
      pushSubscriptions: Number(stats?.push_subscriptions ?? 0),
      role: profile?.role === 'admin' ? 'admin' : 'user',
      envAdmin: Boolean(user.email_confirmed_at) && isAdminEmail(user.email),
    };
  });

  return { query, ...queryUsers(rows, query), currentUserId: session?.userId ?? null };
}

const userIdSchema = z.uuid();

/** Admin only: grants or removes profiles.role = 'admin'. Admins cannot demote themselves. */
export async function setUserAdminRole(userId: string, makeAdmin: boolean): Promise<AdminUserActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  if (!userIdSchema.safeParse(userId).success || typeof makeAdmin !== 'boolean') {
    return { ok: false, error: 'invalid' };
  }
  if (!makeAdmin && (await getSignedInClient())?.userId === userId) {
    return { ok: false, error: 'cannot_demote_self' };
  }

  const { error } = await createAdminSupabaseClient()
    .from('profiles')
    .upsert({ id: userId, role: makeAdmin ? 'admin' : 'user' }, { onConflict: 'id' });
  if (error) {
    console.error('[admin-users] role update failed:', error.message);
    return { ok: false, error: 'failed' };
  }
  return { ok: true };
}

/** Admin only: turns a user's new-lesson emails on or off. */
export async function setUserEmailNotifications(userId: string, enabled: boolean): Promise<AdminUserActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  if (!userIdSchema.safeParse(userId).success || typeof enabled !== 'boolean') {
    return { ok: false, error: 'invalid' };
  }

  const { error } = await createAdminSupabaseClient()
    .from('profiles')
    .upsert({ id: userId, notify_new_lessons: enabled }, { onConflict: 'id' });
  if (error) {
    console.error('[admin-users] notification update failed:', error.message);
    return { ok: false, error: 'failed' };
  }
  return { ok: true };
}
