import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBookmark } from '@/actions/bookmarks';

export interface LocalBookmark {
  id: string;
  lessonId: string;
  position: number;
  note: string;
  tag: string;
  createdAt: string;
}

interface BookmarksState {
  bookmarks: LocalBookmark[];
  addBookmark: (lessonId: string, position: number, note: string, tag: string) => void;
  removeBookmark: (id: string) => void;
  getBookmarksByLesson: (lessonId: string) => LocalBookmark[];
  hasBookmark: (lessonId: string) => boolean;
  updateBookmark: (id: string, updates: Partial<Pick<LocalBookmark, 'note' | 'tag'>>) => void;
}

export const useBookmarksStore = create<BookmarksState>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      addBookmark: (lessonId, position, note, tag) => {
        const newBookmark: LocalBookmark = {
          id: crypto.randomUUID(),
          lessonId,
          position,
          note,
          tag,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          bookmarks: [...state.bookmarks, newBookmark],
        }));

        // Fire-and-forget server sync
        createBookmark({
          lesson_id: lessonId,
          position: Math.round(position),
          note: note || undefined,
        }).catch(() => {
          // Silent fail — local-first
        });
      },

      removeBookmark: (id) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
        }));
      },

      getBookmarksByLesson: (lessonId) => {
        return get().bookmarks.filter((b) => b.lessonId === lessonId);
      },

      hasBookmark: (lessonId) => {
        return get().bookmarks.some((b) => b.lessonId === lessonId);
      },

      updateBookmark: (id, updates) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        }));
      },
    }),
    {
      name: 'tora-bookmarks',
    }
  )
);
