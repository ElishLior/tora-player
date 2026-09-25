import { signOut } from '@/actions/auth';
import { syncBookmarks } from '@/actions/bookmarks';
import { syncNotes } from '@/actions/notes';
import { syncProgress } from '@/actions/progress';
import { applyServerProgress, mergeBookmarks, isNoteDirty, mergeNotes, toNoteInput } from '@/lib/account/merge';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { useNotesStore } from '@/stores/notes-store';
import { useProgressStore } from '@/stores/progress-store';

/*
 * Client-side account sync. Anonymous users keep bookmarks/progress/notes on
 * the device; once signed in, the device copy is merged into the account and
 * the account copy is pulled back (both directions idempotent).
 */

let inFlight: Promise<void> | null = null;

async function syncBookmarksNow(): Promise<void> {
  const { bookmarks, pendingDeletes } = useBookmarksStore.getState();
  const result = await syncBookmarks({
    bookmarks: bookmarks.map((b) => ({
      id: b.id,
      lesson_id: b.lessonId,
      position: b.position,
      note: b.note || null,
      tag: b.tag || null,
      audio_file_id: b.audioFileId ?? null,
    })),
    deletedIds: pendingDeletes,
  });
  if ('error' in result) {
    console.warn('[account] bookmark sync failed:', result.error);
    return;
  }
  useBookmarksStore.setState((state) => {
    const stillPending = state.pendingDeletes.filter((id) => !pendingDeletes.includes(id));
    return {
      bookmarks: mergeBookmarks(state.bookmarks, result.data, stillPending),
      pendingDeletes: stillPending,
    };
  });
}

async function syncProgressNow(): Promise<void> {
  const entries = Object.values(useProgressStore.getState().progressMap).map((p) => ({
    lesson_id: p.lessonId,
    audio_file_id: p.audioFileId ?? null,
    position: p.position,
    completed: p.completed,
    last_played_at: p.lastPlayed,
  }));
  const result = await syncProgress(entries);
  if ('error' in result) {
    console.warn('[account] progress sync failed:', result.error);
    return;
  }
  useProgressStore.setState((state) => ({
    progressMap: applyServerProgress(state.progressMap, result.data),
  }));
}

async function syncNotesNow(): Promise<void> {
  const { notes: sent, pendingDeletes } = useNotesStore.getState();
  const result = await syncNotes({
    notes: sent.filter(isNoteDirty).map(toNoteInput),
    deletedIds: pendingDeletes,
  });
  if ('error' in result) {
    console.warn('[account] notes sync failed:', result.error);
    return;
  }
  useNotesStore.setState((state) => {
    const stillPending = state.pendingDeletes.filter((id) => !pendingDeletes.includes(id));
    return {
      notes: mergeNotes(state.notes, result.data, stillPending, sent),
      pendingDeletes: stillPending,
    };
  });
}

/** Links the device stores to `userId` and merges both ways. Concurrent calls share one run. */
export function syncAccountData(userId: string): Promise<void> {
  useBookmarksStore.setState({ accountUserId: userId });
  useNotesStore.setState({ accountUserId: userId });
  inFlight ??= Promise.all([syncBookmarksNow(), syncProgressNow(), syncNotesNow()])
    .then(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Signs out (Supabase session and admin password session). When a user
 * account was linked, its bookmarks/progress/notes leave this device too
 * (after a last sync so nothing is lost) and cached per-user pages are dropped.
 * Finishes with a full reload at `redirectTo`.
 */
export async function signOutAndReset(redirectTo: string): Promise<void> {
  const userId = useBookmarksStore.getState().accountUserId;
  if (userId) await syncAccountData(userId).catch(() => undefined);
  await signOut();
  if (userId) {
    useBookmarksStore.setState({ bookmarks: [], pendingDeletes: [], accountUserId: null });
    useNotesStore.setState({ notes: [], pendingDeletes: [], accountUserId: null });
    useProgressStore.setState({ progressMap: {} });
  }
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHES' });
  window.location.assign(redirectTo);
}
