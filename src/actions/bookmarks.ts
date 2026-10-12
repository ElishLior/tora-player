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

/** Result of a write that reports the row's server `updated_at` (null before migration 024). */
export type BookmarkWriteResult = { error?: string; updatedAt?: string | null };

/**
 * Migration 024 not applied yet: the column is missing from the select, the
 * filter or the write. Callers retry without it (src/lib/supabase/lesson-slug-select.ts
 * does the same for slugs).
 */
function isMissingUpdatedAt(error: { code?: string; message?: string }): boolean {
  return ['42703', 'PGRST204'].includes(error.code ?? '') && /updated_at/i.test(error.message ?? '');
}

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

export async function createBookmark(data: BookmarkInput): Promise<BookmarkWriteResult> {
  const parsed = bookmarkSchema.safeParse(data);
  if (!parsed.success) return { error: 'invalid_bookmark' };

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };

  const row = toRow(parsed.data, session.userId);
  const write = (columns: string) =>
    session.supabase.from('bookmarks').upsert(row, { onConflict: 'id' }).select(columns);
  let result = await write('updated_at');
  if (result.error && isMissingUpdatedAt(result.error)) result = await write('id');
  if (result.error) {
    console.error('[bookmarks] create failed:', result.error.message);
    return { error: result.error.message };
  }
  const created = (result.data ?? []) as Array<{ updated_at?: string | null }>;
  return { updatedAt: created[0]?.updated_at ?? null };
}

/**
 * Edits the note and/or tag of one of the caller's bookmarks (id, lesson and
 * position never change). Ownership is enforced here: the update filters on
 * the session's user id, never on a client-supplied one.
 *
 * `expectedUpdatedAt` is the server `updated_at` the editor was based on. The
 * update only applies while the row still has it; 0 rows then means the
 * bookmark changed or was removed elsewhere (`changed_elsewhere`), and nothing
 * is overwritten. `null` = unconditional (a bookmark the account never
 * confirmed; 0 rows = `not_uploaded`). Before migration 024 the check is not
 * possible, so the update is unconditional by id + user.
 */
export async function updateBookmark(
  id: string,
  updates: { note?: string | null; tag?: string | null },
  expectedUpdatedAt?: string | null,
): Promise<BookmarkWriteResult> {
  const parsed = bookmarkSchema.pick({ id: true, note: true, tag: true }).safeParse({ id, ...updates });
  if (!parsed.success) return { error: 'invalid_bookmark' };
  if (expectedUpdatedAt != null && (typeof expectedUpdatedAt !== 'string' || expectedUpdatedAt.length > 64)) {
    return { error: 'invalid_bookmark' };
  }
  // Kept exactly as the server returned it: a timestamp string compares equal only in its original form.
  const expectedValue = expectedUpdatedAt || null;

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };

  const patch: { note?: string | null; tag?: string | null } = {};
  if (parsed.data.note !== undefined) patch.note = parsed.data.note || null;
  if (parsed.data.tag !== undefined) patch.tag = parsed.data.tag || null;

  const write = (columns: string, conditional: boolean) => {
    let query = session.supabase.from('bookmarks').update(patch).eq('id', parsed.data.id).eq('user_id', session.userId);
    if (conditional && expectedValue) query = query.eq('updated_at', expectedValue);
    return query.select(columns);
  };

  let result = await write('id, updated_at', true);
  if (result.error && isMissingUpdatedAt(result.error)) result = await write('id', false);
  if (result.error) {
    console.error('[bookmarks] update failed:', result.error.message);
    return { error: result.error.message };
  }
  const rows = (result.data ?? []) as Array<{ updated_at?: string | null }>;
  if (rows.length === 0) return { error: expectedValue ? 'changed_elsewhere' : 'not_uploaded' };
  return { updatedAt: rows[0].updated_at ?? null };
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

    const readAll = (columns: string) =>
      supabase.from('bookmarks').select(columns).order('created_at', { ascending: true });
    let { data, error } = await readAll(`${BOOKMARK_COLUMNS}, updated_at`);
    if (error && isMissingUpdatedAt(error)) ({ data, error } = await readAll(BOOKMARK_COLUMNS));
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as unknown as ServerBookmark[] };
  } catch (err) {
    console.error('[bookmarks] sync failed:', err);
    return { error: err instanceof Error ? err.message : 'sync_failed' };
  }
}
