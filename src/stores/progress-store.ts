import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LocalProgress {
  lessonId: string;
  position: number;
  lastPlayed: string;
  completed: boolean;
}

interface ProgressState {
  progressMap: Record<string, LocalProgress>;
  updateProgress: (lessonId: string, position: number) => void;
  markComplete: (lessonId: string) => void;
  getProgress: (lessonId: string) => LocalProgress | undefined;
  getRecentlyPlayed: (limit: number) => LocalProgress[];
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      progressMap: {},

      updateProgress: (lessonId, position) => {
        set((state) => ({
          progressMap: {
            ...state.progressMap,
            [lessonId]: {
              lessonId,
              position,
              lastPlayed: new Date().toISOString(),
              completed: state.progressMap[lessonId]?.completed ?? false,
            },
          },
        }));
      },

      markComplete: (lessonId) => {
        set((state) => ({
          progressMap: {
            ...state.progressMap,
            [lessonId]: {
              ...state.progressMap[lessonId],
              lessonId,
              position: state.progressMap[lessonId]?.position ?? 0,
              lastPlayed: new Date().toISOString(),
              completed: true,
            },
          },
        }));
      },

      getProgress: (lessonId) => {
        return get().progressMap[lessonId];
      },

      getRecentlyPlayed: (limit) => {
        const entries = Object.values(get().progressMap);
        return entries
          .sort((a, b) => new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime())
          .slice(0, limit);
      },
    }),
    {
      name: 'tora-progress',
    }
  )
);
