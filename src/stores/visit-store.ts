import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A pause this long ends a visit. Reloads and short app switches inside one
 * visit keep the same "new since" threshold, so badges do not vanish mid-visit.
 */
export const VISIT_GAP_MS = 30 * 60_000;

export interface VisitTimes {
  /** Lessons created after this moment are "new" during the current visit. Null on the first visit. */
  previousVisitAt: string | null;
  /** Last moment this device was seen using the app. */
  lastVisitAt: string | null;
}

/**
 * The visit times after the app is opened or seen again at `now`: a new visit
 * starts when the last one ended more than VISIT_GAP_MS ago.
 */
export function touchVisit(times: VisitTimes, now: Date): VisitTimes {
  const last = times.lastVisitAt ? Date.parse(times.lastVisitAt) : NaN;
  const newVisit = !Number.isFinite(last) || now.getTime() - last > VISIT_GAP_MS;
  return {
    previousVisitAt: newVisit ? times.lastVisitAt : times.previousVisitAt,
    lastVisitAt: now.toISOString(),
  };
}

/** Whether a lesson counts as new for this visit: created since the previous visit. */
export function isNewSince(createdAt: string | null | undefined, previousVisitAt: string | null): boolean {
  if (!createdAt || !previousVisitAt) return false;
  return Date.parse(createdAt) > Date.parse(previousVisitAt);
}

interface VisitState extends VisitTimes {
  touch: () => void;
}

export const useVisitStore = create<VisitState>()(
  persist(
    (set, get) => ({
      previousVisitAt: null,
      lastVisitAt: null,
      touch: () => set(touchVisit(get(), new Date())),
    }),
    {
      name: 'tora-visits',
      partialize: ({ previousVisitAt, lastVisitAt }): VisitTimes => ({ previousVisitAt, lastVisitAt }),
      onRehydrateStorage: () => (state) => {
        if (!state || typeof window === 'undefined') return;
        state.touch();
        // Leaving the app marks when this visit was last seen; coming back after a
        // long pause starts a new visit.
        const touch = () => useVisitStore.getState().touch();
        document.addEventListener('visibilitychange', touch);
        window.addEventListener('pagehide', touch);
      },
    },
  ),
);
