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
  /** Observed length of the saved audio file when its catalog duration is unknown. */
  duration?: number;
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

/** An unknown part count is only a single-file lesson without an audio file id. */
export function isLastPart(part: { audioFileId?: string; partIndex?: number; partCount?: number }): boolean {
  if (part.partCount === undefined) return !part.audioFileId;
  return part.partIndex !== undefined && part.partCount > 0 &&
    part.partIndex >= 0 && part.partIndex === part.partCount - 1;
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

  if (isNearPartEnd(progress.position, parts[found].duration > 0 ? parts[found].duration : progress.duration ?? 0)) {
    return found + 1 < parts.length ? { index: found + 1, position: 0 } : start;
  }
  if (progress.position < MIN_RESUME_SECONDS) return { index: found, position: 0 };
  return { index: found, position: progress.position };
}

/** Share of the whole lesson heard, 0–1, counting finished earlier parts. */
export function getListenedFraction(parts: LessonPartRef[], progress: SavedLessonProgress | undefined): number {
  if (!progress) return 0;
  if (progress.completed) return 1;
  if (parts.length === 0) return 0;
  const found = progress.audioFileId ? parts.findIndex((part) => part.audioFileId === progress.audioFileId) : 0;
  if (found < 0) return 0;
  const currentDuration = parts[found].duration || progress.duration || 0;
  let before = 0;
  let total = 0;
  for (let index = 0; index < parts.length; index++) {
    const duration = index === found ? currentDuration : parts[index].duration || 0;
    if (!(duration > 0)) return 0;
    if (index < found) before += duration;
    total += duration;
  }
  const inPart = Math.min(progress.position, currentDuration || progress.position);
  return Math.min(1, Math.max(0, (before + inPart) / total));
}
