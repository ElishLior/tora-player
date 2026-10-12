import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBookmark, deleteBookmark, updateBookmark as updateBookmarkOnAccount } from '@/actions/bookmarks';

export interface LocalBookmark {
  id: string;
  lessonId: string;
  position: number;
  note: string;
  tag: string;
  createdAt: string;
  lessonTitle?: string;
  audioFileId?: string | null;
  /**
   * The account's `updated_at` for this bookmark, as the server returned it (create,
   * edit or sync). Never set from the device clock. Undefined until the account has
   * confirmed the bookmark, and always before migration 024. Edits are conditioned on it.
   */
  updatedAt?: string;
}

/** Note and/or tag: the only fields a bookmark edit changes (position, part and lesson stay). */
export type BookmarkEdit = Partial<Pick<LocalBookmark, 'note' | 'tag'>>;

/**
 * `sync_failed`: saved on this device, but mirroring to the signed-in account failed (UI: t('bookmarks.syncFailed')).
 * For an edit it also means: applied on this device, not in the account yet (the next sync inserts it with the edit).
 */
type SyncResult = { error?: 'sync_failed' };

/**
 * Edit outcomes. `changed_elsewhere`: the bookmark differs from the version the editor
 * opened (another device, or a sync). Nothing changed here; reload to see it.
 * `save_failed`: the account could not be reached or refused the change; nothing changed here.
 */
export type BookmarkUpdateResult = { error?: 'sync_failed' | 'changed_elsewhere' | 'save_failed' };

interface BookmarksState {
  bookmarks: LocalBookmark[];
  /** Ids removed on this device that may still exist in the account; the next sync deletes them. */
  pendingDeletes: string[];
  /** Signed-in user whose account mirrors these bookmarks; null = local-only. Not persisted. */
  accountUserId: string | null;
  /** Local change applies immediately; `error` means the signed-in account sync failed. */
  addBookmark: (
    lessonId: string,
    position: number,
    note: string,
    tag: string,
    extra?: { lessonTitle?: string; audioFileId?: string | null },
  ) => Promise<SyncResult>;
  removeBookmark: (id: string) => Promise<SyncResult>;
  /**
   * Edits one bookmark in place: same id, lesson, position and part; nothing new is created.
   * `expectedUpdatedAt` is the version the editor opened (`bookmark.updatedAt` at that time;
   * omit or null when the account never confirmed it). A different current version means
   * `changed_elsewhere`. Signed-in: the account write goes first and the device copy changes
   * only after it succeeds (the server holds the stale-edit check).
   */
  updateBookmark: (
    id: string,
    updates: BookmarkEdit,
    options?: { expectedUpdatedAt?: string | null },
  ) => Promise<BookmarkUpdateResult>;
  getBookmarksByLesson: (lessonId: string) => LocalBookmark[];
  hasBookmark: (lessonId: string) => boolean;
}

const SYNC_FAILED = 'sync_failed' as const;
const CHANGED_ELSEWHERE = 'changed_elsewhere' as const;
const SAVE_FAILED = 'save_failed' as const;
const MAX_PENDING_DELETES = 500;

export const useBookmarksStore = create<BookmarksState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      pendingDeletes: [],
      accountUserId: null,

      addBookmark: async (lessonId, position, note, tag, extra) => {
        const bookmark: LocalBookmark = {
          id: crypto.randomUUID(),
          lessonId,
          position,
          note,
          tag,
          createdAt: new Date().toISOString(),
          lessonTitle: extra?.lessonTitle,
          audioFileId: extra?.audioFileId ?? null,
        };
        set((state) => ({ bookmarks: [...state.bookmarks, bookmark] }));

        // Anonymous: local only. Signed-in bookmarks that fail here are
        // uploaded by the next sync (it inserts every local bookmark).
        if (!get().accountUserId) return {};
        try {
          const result = await createBookmark({
            id: bookmark.id,
            lesson_id: lessonId,
            position,
            note: note || null,
            tag: tag || null,
            audio_file_id: bookmark.audioFileId,
          });
          if (result.error) return { error: SYNC_FAILED };
          if (result.updatedAt) setServerUpdatedAt(bookmark.id, result.updatedAt);
          return {};
        } catch {
          return { error: SYNC_FAILED };
        }
      },

      removeBookmark: async (id) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
          pendingDeletes: [...state.pendingDeletes.filter((pending) => pending !== id), id].slice(-MAX_PENDING_DELETES),
        }));

        if (!get().accountUserId) return {};
        try {
          const result = await deleteBookmark(id);
          if (result.error) return { error: SYNC_FAILED };
          set((state) => ({ pendingDeletes: state.pendingDeletes.filter((pending) => pending !== id) }));
          return {};
        } catch {
          return { error: SYNC_FAILED };
        }
      },

      updateBookmark: async (id, updates, options) => {
        const current = get().bookmarks.find((b) => b.id === id);
        const expected = options?.expectedUpdatedAt ?? null;
        // The editor opened another version (a sync or another tab changed it since), or the bookmark is gone.
        if (!current || (expected !== null && current.updatedAt !== expected)) return { error: CHANGED_ELSEWHERE };

        const applyLocally = (updatedAt?: string) =>
          set((state) => ({
            bookmarks: state.bookmarks.map((b) =>
              b.id === id ? { ...b, ...updates, ...(updatedAt ? { updatedAt } : {}) } : b,
            ),
          }));

        if (!get().accountUserId) {
          applyLocally();
          return {};
        }
        try {
          const result = await updateBookmarkOnAccount(id, updates, expected);
          if (result.error === 'changed_elsewhere') return { error: CHANGED_ELSEWHERE };
          if (result.error === 'not_uploaded') {
            // Never reached the account: keep the edit here; the next sync inserts the bookmark with it.
            applyLocally();
            return { error: SYNC_FAILED };
          }
          if (result.error) return { error: SAVE_FAILED };
          applyLocally(result.updatedAt ?? undefined);
          return {};
        } catch {
          return { error: SAVE_FAILED };
        }
      },

      getBookmarksByLesson: (lessonId) => get().bookmarks.filter((b) => b.lessonId === lessonId),

      hasBookmark: (lessonId) => get().bookmarks.some((b) => b.lessonId === lessonId),
    }),
    {
      name: 'tora-bookmarks',
      partialize: (state) => ({ bookmarks: state.bookmarks, pendingDeletes: state.pendingDeletes }),
    },
  ),
);

function setServerUpdatedAt(id: string, updatedAt: string) {
  useBookmarksStore.setState((state) => ({
    bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, updatedAt } : b)),
  }));
}
