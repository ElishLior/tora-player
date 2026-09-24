import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBookmark, deleteBookmark, updateBookmark } from '@/actions/bookmarks';

export interface LocalBookmark {
  id: string;
  lessonId: string;
  position: number;
  note: string;
  tag: string;
  createdAt: string;
  lessonTitle?: string;
  audioFileId?: string | null;
}

/** `sync_failed`: saved on this device, but mirroring to the signed-in account failed (UI: t('bookmarks.syncFailed')). */
type SyncResult = { error?: 'sync_failed' };

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
  updateBookmark: (id: string, updates: Partial<Pick<LocalBookmark, 'note' | 'tag'>>) => Promise<SyncResult>;
  getBookmarksByLesson: (lessonId: string) => LocalBookmark[];
  hasBookmark: (lessonId: string) => boolean;
}

const SYNC_FAILED = 'sync_failed' as const;
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
          return result.error ? { error: SYNC_FAILED } : {};
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

      updateBookmark: async (id, updates) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        }));

        if (!get().accountUserId) return {};
        try {
          const result = await updateBookmark(id, updates);
          return result.error ? { error: SYNC_FAILED } : {};
        } catch {
          return { error: SYNC_FAILED };
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
