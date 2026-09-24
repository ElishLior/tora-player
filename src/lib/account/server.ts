import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/** Max ids per `.in()` filter, keeping PostgREST URLs short. */
export const ID_CHUNK = 100;

/**
 * Cookie-bound Supabase client plus the signed-in user's id, or null for
 * anonymous requests. Writes made with it are scoped by owner-only RLS.
 */
export async function getSignedInClient(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

/**
 * The subset of `ids` that exists in `table` and is readable by the caller
 * (RLS: published lessons and their audio). Queried in chunks to keep the
 * PostgREST URL short.
 */
export async function filterVisibleIds(
  supabase: SupabaseClient,
  table: 'lessons' | 'lesson_audio',
  ids: string[],
): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  const found = new Set<string>();
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const { data, error } = await supabase.from(table).select('id').in('id', unique.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) found.add(row.id as string);
  }
  return found;
}
