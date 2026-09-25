import type { LocalBookmark } from '@/stores/bookmarks-store';
import type { LocalNote } from '@/stores/notes-store';
import type { LocalProgress } from '@/stores/progress-store';

/*
 * Pure merge rules for syncing device-local bookmarks/progress/notes with the
 * signed-in account. Shared by the client sync (src/lib/account/sync.ts) and
 * the server actions.
 */

export interface ServerBookmark {
  id: string;
  lesson_id: string;
  position: number;
  note: string | null;
  tag: string | null;
  audio_file_id: string | null;
  created_at: string;
  lesson: { title: string; hebrew_title: string | null } | null;
}

export interface ServerProgress {
  lesson_id: string;
  audio_file_id: string | null;
  position: number;
  completed: boolean;
  last_played_at: string;
}

/**
 * Account rows win for bookmarks both sides know; local-only bookmarks (not
 * uploaded yet, or for lessons the server skipped) are kept; anything the user
 * deleted locally (`pendingDeletes`) never comes back.
 */
export function mergeBookmarks(
  local: LocalBookmark[],
  server: ServerBookmark[],
  pendingDeletes: string[],
): LocalBookmark[] {
  const deleted = new Set(pendingDeletes);
  const localById = new Map(local.map((bookmark) => [bookmark.id, bookmark]));
  const merged: LocalBookmark[] = [];
  const seen = new Set<string>();

  for (const row of server) {
    if (deleted.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    const previous = localById.get(row.id);
    merged.push({
      id: row.id,
      lessonId: row.lesson_id,
      // Server stores whole seconds; keep the precise local value when it rounds to the same second.
      position: previous && Math.round(previous.position) === row.position ? previous.position : row.position,
      note: row.note ?? '',
      tag: row.tag ?? '',
      createdAt: row.created_at,
      lessonTitle: row.lesson?.hebrew_title || row.lesson?.title || previous?.lessonTitle,
      audioFileId: row.audio_file_id,
    });
  }

  for (const bookmark of local) {
    if (!seen.has(bookmark.id) && !deleted.has(bookmark.id)) merged.push(bookmark);
  }
  return merged;
}

function toMillis(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

/** Local entries that are newer than (or missing from) the account. */
export function pickProgressToUpload(local: LocalProgress[], server: ServerProgress[]): LocalProgress[] {
  const serverByLesson = new Map(server.map((row) => [row.lesson_id, row]));
  return local.filter((entry) => {
    const remote = serverByLesson.get(entry.lessonId);
    return !remote || toMillis(entry.lastPlayed) > toMillis(remote.last_played_at);
  });
}

/** Last-played-wins merge of account progress into the device map. */
export function applyServerProgress(
  local: Record<string, LocalProgress>,
  server: ServerProgress[],
): Record<string, LocalProgress> {
  const merged = { ...local };
  for (const row of server) {
    const current = merged[row.lesson_id];
    if (!current || toMillis(row.last_played_at) > toMillis(current.lastPlayed)) {
      merged[row.lesson_id] = {
        lessonId: row.lesson_id,
        audioFileId: row.audio_file_id ?? undefined,
        position: row.position,
        ...(current?.duration && current.audioFileId === (row.audio_file_id ?? undefined)
          ? { duration: current.duration }
          : {}),
        lastPlayed: row.last_played_at,
        completed: row.completed,
      };
    }
  }
  return merged;
}

/** A note as stored in `lesson_notes` (without the owner). */
export interface NoteInput {
  id: string;
  lesson_id: string;
  audio_file_id: string | null;
  position_seconds: number | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface ServerNoteImage {
  id: string;
  content_type: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface ServerNote extends NoteInput {
  lesson: { title: string; hebrew_title: string | null } | null;
  images: ServerNoteImage[] | null;
}

export function toNoteInput(note: LocalNote): NoteInput {
  return {
    id: note.id,
    lesson_id: note.lessonId,
    audio_file_id: note.audioFileId,
    position_seconds: note.position,
    body: note.body,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

/** Never stored in the account, or edited on this device after the last sync. */
export function isNoteDirty(note: LocalNote): boolean {
  return note.syncedAt === null || toMillis(note.updatedAt) > toMillis(note.syncedAt);
}

/** Server side of last-write-wins: incoming notes the account lacks or holds an older version of. */
export function selectNewerNotes<T extends { id: string; updated_at: string }>(
  incoming: T[],
  existing: { id: string; updated_at: string }[],
): T[] {
  const existingById = new Map(existing.map((row) => [row.id, row.updated_at]));
  return incoming.filter((note) => {
    const stored = existingById.get(note.id);
    return stored === undefined || toMillis(note.updated_at) > toMillis(stored);
  });
}

/**
 * Merges the account's notes into the device list (`current`):
 * - the newer edit wins per note; images always come from the account;
 * - notes deleted on this device (`pendingDeletes`) never come back;
 * - device-only notes are kept, except clean copies of account notes that
 *   were in `sent` (the snapshot taken when the sync started) and are gone
 *   from the account now, i.e. deleted on another device.
 */
export function mergeNotes(
  current: LocalNote[],
  server: ServerNote[],
  pendingDeletes: string[],
  sent: LocalNote[],
): LocalNote[] {
  const deleted = new Set(pendingDeletes);
  const currentById = new Map(current.map((note) => [note.id, note]));
  const knownClean = new Set(sent.filter((note) => !isNoteDirty(note)).map((note) => note.id));
  const merged: LocalNote[] = [];
  const seen = new Set<string>();

  for (const row of server) {
    if (deleted.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    const local = currentById.get(row.id);
    const lessonTitle = row.lesson?.hebrew_title || row.lesson?.title || local?.lessonTitle;
    const images = [...(row.images ?? [])]
      .sort((a, b) => toMillis(a.created_at) - toMillis(b.created_at))
      .map((image) => ({ id: image.id, width: image.width, height: image.height }));

    if (local && toMillis(local.updatedAt) > toMillis(row.updated_at)) {
      merged.push({ ...local, lessonTitle, images, syncedAt: row.updated_at });
      continue;
    }
    merged.push({
      id: row.id,
      lessonId: row.lesson_id,
      body: row.body,
      position: row.position_seconds === null ? null : Number(row.position_seconds),
      audioFileId: row.audio_file_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncedAt: row.updated_at,
      lessonTitle,
      images,
    });
  }

  for (const note of current) {
    if (seen.has(note.id) || deleted.has(note.id)) continue;
    if (knownClean.has(note.id) && !isNoteDirty(note)) continue;
    merged.push(note);
  }
  return merged;
}
