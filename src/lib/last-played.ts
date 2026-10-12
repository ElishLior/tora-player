import type { LocalProgress } from '@/stores/progress-store';

/** Progress entries, most recently played first. Entries without a valid time sort last. */
export function sortByRecency(entries: readonly LocalProgress[]): LocalProgress[] {
  const time = (entry: LocalProgress) => Date.parse(entry.lastPlayed) || 0;
  return [...entries].sort((a, b) => time(b) - time(a));
}

/**
 * The lesson the desktop panel offers when nothing is loaded: the most recently
 * played lesson that is not heard to the end yet (the same candidate the
 * "continue listening" strip starts from), else the most recently played one.
 * Null when nothing was ever played on this device.
 */
export function pickLastPlayed(progressMap: Record<string, LocalProgress | undefined>): LocalProgress | null {
  const entries = sortByRecency(
    Object.values(progressMap).filter((entry): entry is LocalProgress => !!entry?.lessonId),
  );
  return entries.find((entry) => !entry.completed) ?? entries[0] ?? null;
}
