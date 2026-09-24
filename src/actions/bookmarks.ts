'use server';

import { filterVisibleIds, getSignedInClient, ID_CHUNK } from '@/lib/account/server';
import type { ServerBookmark } from '@/lib/account/merge';
import { bookmarkSchema, bookmarkSyncSchema } from '@/lib/validators';

/*
 * Bookmarks are local-first (src/stores/bookmarks-store.ts). For signed-in
 * users every change is mirrored here, scoped by RLS to auth.uid(). The row id
 * is the client-generated bookmark id, so retries and syncs are idempotent.
 */

type BookmarkInput = {
  id: string;
  lesson_id: string;
  position: number;
  note?: string | null;
  tag?: string | null;
  audio_file_id?: string | null;
};

const AUTH_REQUIRED = 'auth_required';
const BOOKMARK_COLUMNS = 'id, lesson_id, position, note, tag, audio_file_id, created_at, lesson:lessons(title, hebrew_title)';

function toRow(bookmark: BookmarkInput, userId: string) {
  return {
    id: bookmark.id,
    user_id: userId,
    lesson_id: bookmark.lesson_id,
    position: Math.round(bookmark.position),
    note: bookmark.note || null,
    tag: bookmark.tag || null,
    audio_file_id: bookmark.audio_file_id || null,
  };
}

export async function createBookmark(data: BookmarkInput): Promise<{ error?: string }> {
  const parsed = bookmarkSchema.safeParse(data);
  if (!parsed.success) return { error: 'invalid_bookmark' };

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };

  const { error } = await session.supabase
    .from('bookmarks')
    .upsert(toRow(parsed.data, session.userId), { onConflict: 'id' });
  if (error) {
    console.error('[bookmarks] create failed:', error.message);
    return { error: error.message };
  }
  return {};
}

export async function updateBookmark(
  id: string,
  updates: { note?: string | null; tag?: string | null },
): Promise<{ error?: string }> {
  const parsed = bookmarkSchema.pick({ id: true, note: true, tag: true }).safeParse({ id, ...updates });
  if (!parsed.success) return { error: 'invalid_bookmark' };

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };

  const patch: { note?: string | null; tag?: string | null } = {};
  if (parsed.data.note !== undefined) patch.note = parsed.data.note || null;
  if (parsed.data.tag !== undefined) patch.tag = parsed.data.tag || null;

  const { error } = await session.supabase.from('bookmarks').update(patch).eq('id', parsed.data.id);
  if (error) {
    console.error('[bookmarks] update failed:', error.message);
    return { error: error.message };
  }
  return {};
}

export async function deleteBookmark(id: string): Promise<{ error?: string }> {
  const parsed = bookmarkSchema.shape.id.safeParse(id);
  if (!parsed.success) return { error: 'invalid_bookmark' };

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };

  const { error } = await session.supabase.from('bookmarks').delete().eq('id', parsed.data);
  if (error) {
    console.error('[bookmarks] delete failed:', error.message);
    return { error: error.message };
  }
  return {};
}

/**
 * Applies pending deletions, inserts local bookmarks the account doesn't have
 * yet (existing server rows win), and returns the account's full list.
 * Bookmarks for lessons that are no longer published stay local-only.
 */
export async function syncBookmarks(input: {
  bookmarks: BookmarkInput[];
  deletedIds: string[];
}): Promise<{ data: ServerBookmark[] } | { error: string }> {
  const parsed = bookmarkSyncSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_bookmarks' };

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };
  const { supabase, userId } = session;

  try {
    const { deletedIds, bookmarks } = parsed.data;
    for (let i = 0; i < deletedIds.length; i += ID_CHUNK) {
      const { error } = await supabase.from('bookmarks').delete().in('id', deletedIds.slice(i, i + ID_CHUNK));
      if (error) throw new Error(error.message);
    }

    if (bookmarks.length > 0) {
      const lessonIds = await filterVisibleIds(supabase, 'lessons', bookmarks.map((b) => b.lesson_id));
      const audioIds = await filterVisibleIds(
        supabase,
        'lesson_audio',
        bookmarks.flatMap((b) => (b.audio_file_id ? [b.audio_file_id] : [])),
      );
      const rows = bookmarks
        .filter((b) => lessonIds.has(b.lesson_id))
        .map((b) => toRow({ ...b, audio_file_id: b.audio_file_id && audioIds.has(b.audio_file_id) ? b.audio_file_id : null }, userId));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('bookmarks')
          .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
    }

    const { data, error } = await supabase
      .from('bookmarks')
      .select(BOOKMARK_COLUMNS)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as unknown as ServerBookmark[] };
  } catch (err) {
    console.error('[bookmarks] sync failed:', err);
    return { error: err instanceof Error ? err.message : 'sync_failed' };
  }
}
