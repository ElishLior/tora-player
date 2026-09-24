/*
 * Pure rules for listening progress across a lesson's parts (audio files).
 * Progress is one entry per lesson: the part last listened to and the position
 * inside it. Shared by the audio controller (saving), the play entry points
 * (resuming) and the lists (progress bars).
 */

/**
 * A part counts as finished within its last minute, or its last 5% when that
 * is shorter (short clips). Long lessons never skip minutes of content.
 */
export const COMPLETE_REMAINING_SECONDS = 60;
export const COMPLETE_FRACTION = 0.95;
/** Positions this close to the start are not worth resuming. */
export const MIN_RESUME_SECONDS = 5;

export interface LessonPartRef {
  audioFileId?: string;
  duration: number;
}

export interface SavedLessonProgress {
  audioFileId?: string;
  position: number;
  completed: boolean;
}

export interface ResumePoint {
  /** Index of the part to play. */
  index: number;
  /** Seconds into that part; 0 plays from the start. */
  position: number;
}

export function isNearPartEnd(position: number, duration: number): boolean {
  if (!(duration > 0)) return false;
  const threshold = Math.min(COMPLETE_REMAINING_SECONDS, duration * (1 - COMPLETE_FRACTION));
  return duration - position <= threshold;
}

/** Tracks without part information are single-file lessons. */
export function isLastPart(part: { partIndex?: number; partCount?: number }): boolean {
  if (part.partCount === undefined) return true;
  return (part.partIndex ?? 0) >= part.partCount - 1;
}

/**
 * Where "play" should start for a lesson: the saved part and position, the
 * next part when the saved one was practically finished, and the beginning for
 * a lesson that was heard to the end (or never started).
 */
export function getResumePoint(parts: LessonPartRef[], progress: SavedLessonProgress | undefined): ResumePoint {
  const start = { index: 0, position: 0 };
  if (!progress || progress.completed || parts.length === 0) return start;

  // Entries saved before parts were tracked carry no audioFileId: the main file.
  const found = progress.audioFileId ? parts.findIndex((part) => part.audioFileId === progress.audioFileId) : 0;
  if (found < 0) return start;

  if (isNearPartEnd(progress.position, parts[found].duration)) {
    return found + 1 < parts.length ? { index: found + 1, position: 0 } : start;
  }
  if (progress.position < MIN_RESUME_SECONDS) return { index: found, position: 0 };
  return { index: found, position: progress.position };
}

/** Share of the whole lesson heard, 0–1, counting finished earlier parts. */
export function getListenedFraction(parts: LessonPartRef[], progress: SavedLessonProgress | undefined): number {
  if (!progress) return 0;
  if (progress.completed) return 1;
  const total = parts.reduce((sum, part) => sum + (part.duration || 0), 0);
  if (!(total > 0)) return 0;

  const found = progress.audioFileId ? parts.findIndex((part) => part.audioFileId === progress.audioFileId) : 0;
  if (found < 0) return 0;
  const before = parts.slice(0, found).reduce((sum, part) => sum + (part.duration || 0), 0);
  const inPart = Math.min(progress.position, parts[found].duration || progress.position);
  return Math.min(1, Math.max(0, (before + inPart) / total));
}
