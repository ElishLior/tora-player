import 'server-only';
import { isAdmin } from '@/lib/auth/admin';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { requireServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Client for reading one lesson (lesson page, edit actions). Admins read with
 * the service role so drafts (unpublished lessons, which RLS hides from
 * everyone else) open and can be edited; everyone else gets the cookie client.
 * Queries run with it must not select per-user tables (bookmarks, progress):
 * the service role would return every user's rows.
 */
export async function lessonReadClient() {
  return (await isAdmin()) ? createAdminSupabaseClient() : requireServerSupabaseClient();
}
