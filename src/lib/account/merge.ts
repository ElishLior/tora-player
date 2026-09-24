import type { LocalBookmark } from '@/stores/bookmarks-store';
import type { LocalProgress } from '@/stores/progress-store';

/*
 * Pure merge rules for syncing device-local bookmarks/progress with the
 * signed-in account. Shared by the client sync (src/lib/account/sync.ts) and
 * the progress server action.
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

function playedAt(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

/** Local entries that are newer than (or missing from) the account. */
export function pickProgressToUpload(local: LocalProgress[], server: ServerProgress[]): LocalProgress[] {
  const serverByLesson = new Map(server.map((row) => [row.lesson_id, row]));
  return local.filter((entry) => {
    const remote = serverByLesson.get(entry.lessonId);
    return !remote || playedAt(entry.lastPlayed) > playedAt(remote.last_played_at);
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
    if (!current || playedAt(row.last_played_at) > playedAt(current.lastPlayed)) {
      merged[row.lesson_id] = {
        lessonId: row.lesson_id,
        position: row.position,
        lastPlayed: row.last_played_at,
        completed: row.completed,
      };
    }
  }
  return merged;
}
