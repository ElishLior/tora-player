import { signOut } from '@/actions/auth';
import { syncBookmarks } from '@/actions/bookmarks';
import { syncProgress } from '@/actions/progress';
import { applyServerProgress, mergeBookmarks } from '@/lib/account/merge';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { useProgressStore } from '@/stores/progress-store';

/*
 * Client-side account sync. Anonymous users keep bookmarks/progress on the
 * device; once signed in, the device copy is merged into the account and the
 * account copy is pulled back (both directions idempotent).
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

/** Links the device stores to `userId` and merges both ways. Concurrent calls share one run. */
export function syncAccountData(userId: string): Promise<void> {
  useBookmarksStore.setState({ accountUserId: userId });
  inFlight ??= Promise.all([syncBookmarksNow(), syncProgressNow()])
    .then(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Signs out (Supabase session and admin password session). When a user
 * account was linked, its bookmarks/progress leave this device too (after a
 * last sync so nothing is lost) and cached per-user pages are dropped.
 * Finishes with a full reload at `redirectTo`.
 */
export async function signOutAndReset(redirectTo: string): Promise<void> {
  const userId = useBookmarksStore.getState().accountUserId;
  if (userId) await syncAccountData(userId).catch(() => undefined);
  await signOut();
  if (userId) {
    useBookmarksStore.setState({ bookmarks: [], pendingDeletes: [], accountUserId: null });
    useProgressStore.setState({ progressMap: {} });
  }
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHES' });
  window.location.assign(redirectTo);
}
