import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Listening progress of one lesson on this device: the part last heard
 * (`audioFileId`, absent for single-file lessons and entries saved before
 * parts were tracked) and the position inside it. `completed` reflects the
 * latest listen, so starting a heard lesson again clears it.
 */
export interface LocalProgress {
  lessonId: string;
  audioFileId?: string;
  position: number;
  lastPlayed: string;
  completed: boolean;
}

interface ProgressState {
  progressMap: Record<string, LocalProgress>;
  saveProgress: (entry: Omit<LocalProgress, 'lastPlayed'>) => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      progressMap: {},

      saveProgress: (entry) => {
        set((state) => ({
          progressMap: {
            ...state.progressMap,
            [entry.lessonId]: { ...entry, lastPlayed: new Date().toISOString() },
          },
        }));
      },
    }),
    {
      name: 'tora-progress',
    }
  )
);
