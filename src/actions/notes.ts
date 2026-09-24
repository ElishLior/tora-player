'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { filterVisibleIds, getSignedInClient, ID_CHUNK } from '@/lib/account/server';
import { selectNewerNotes, type NoteInput, type ServerNote } from '@/lib/account/merge';
import { noteImagePrefix } from '@/lib/note-rules';
import { deleteR2Prefix } from '@/lib/r2';
import { isR2RuntimeConfigured } from '@/lib/r2-config';
import { noteSchema, noteSyncSchema } from '@/lib/validators';

/*
 * Personal notes are local-first (src/stores/notes-store.ts). For signed-in
 * users every change is mirrored here, scoped by owner-only RLS. The row id is
 * the client-generated note id and `updated_at` is the device's edit time, so
 * retries are idempotent and the newer edit wins between devices.
 */

const AUTH_REQUIRED = 'auth_required';
const NOTE_COLUMNS =
  'id, lesson_id, audio_file_id, position_seconds, body, created_at, updated_at, ' +
  'lesson:lessons(title, hebrew_title), images:lesson_note_images(id, content_type, width, height, created_at)';
/** PostgREST's default max-rows; the account list is read page by page so no note is ever missed. */
const PAGE_SIZE = 1000;

/**
 * Stores the notes the account lacks or holds an older version of. Notes of
 * lessons that are not published (anymore) stay device-only.
 */
async function writeNotes(supabase: SupabaseClient, userId: string, notes: NoteInput[]): Promise<void> {
  if (notes.length === 0) return;
  const lessonIds = await filterVisibleIds(supabase, 'lessons', notes.map((note) => note.lesson_id));
  const audioIds = await filterVisibleIds(
    supabase,
    'lesson_audio',
    notes.flatMap((note) => (note.audio_file_id ? [note.audio_file_id] : [])),
  );
  const visible = notes.filter((note) => lessonIds.has(note.lesson_id));

  const existing: { id: string; updated_at: string }[] = [];
  for (let i = 0; i < visible.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('lesson_notes')
      .select('id, updated_at')
      .in('id', visible.slice(i, i + ID_CHUNK).map((note) => note.id));
    if (error) throw new Error(error.message);
    existing.push(...(data ?? []));
  }

  const rows = selectNewerNotes(visible, existing).map((note) => ({
    ...note,
    user_id: userId,
    audio_file_id: note.audio_file_id && audioIds.has(note.audio_file_id) ? note.audio_file_id : null,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('lesson_notes').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

/**
 * Deletes notes and their image files. Files go first: if R2 fails the rows
 * stay, the device keeps the id pending and the next sync retries.
 */
async function removeNotes(supabase: SupabaseClient, userId: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const { data: images, error: imagesError } = await supabase
      .from('lesson_note_images')
      .select('note_id')
      .in('note_id', chunk);
    if (imagesError) throw new Error(imagesError.message);
    if (isR2RuntimeConfigured()) {
      for (const noteId of new Set((images ?? []).map((row) => row.note_id as string))) {
        await deleteR2Prefix(noteImagePrefix(userId, noteId));
      }
    }
    const { error } = await supabase.from('lesson_notes').delete().in('id', chunk);
    if (error) throw new Error(error.message);
  }
}

export async function saveNote(input: NoteInput): Promise<{ error?: string }> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_note' };

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };

  try {
    await writeNotes(session.supabase, session.userId, [parsed.data]);
    return {};
  } catch (err) {
    console.error('[notes] save failed:', err);
    return { error: err instanceof Error ? err.message : 'save_failed' };
  }
}

export async function deleteNote(id: string): Promise<{ error?: string }> {
  const parsed = noteSchema.shape.id.safeParse(id);
  if (!parsed.success) return { error: 'invalid_note' };

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };

  try {
    await removeNotes(session.supabase, session.userId, [parsed.data]);
    return {};
  } catch (err) {
    console.error('[notes] delete failed:', err);
    return { error: err instanceof Error ? err.message : 'delete_failed' };
  }
}

/**
 * Applies pending deletions, stores device notes that are new or newer than
 * the account's copy, and returns the account's full list.
 */
export async function syncNotes(input: {
  notes: NoteInput[];
  deletedIds: string[];
}): Promise<{ data: ServerNote[] } | { error: string }> {
  const parsed = noteSyncSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_notes' };

  const session = await getSignedInClient();
  if (!session) return { error: AUTH_REQUIRED };
  const { supabase, userId } = session;

  try {
    await removeNotes(supabase, userId, parsed.data.deletedIds);
    await writeNotes(supabase, userId, parsed.data.notes);

    // A missing row makes the device drop its clean copy (deleted elsewhere), so read every page.
    const notes: ServerNote[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('lesson_notes')
        .select(NOTE_COLUMNS)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      notes.push(...((data ?? []) as unknown as ServerNote[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return { data: notes };
  } catch (err) {
    console.error('[notes] sync failed:', err);
    return { error: err instanceof Error ? err.message : 'sync_failed' };
  }
}
