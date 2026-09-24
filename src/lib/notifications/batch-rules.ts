/**
 * How a batch of newly published lessons is announced. Pure, shared by the
 * upload page (default choice) and notifyNewLessons (summary content).
 */

export const NOTIFY_MODES = ['none', 'summary', 'each'] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];

/** One lesson → its own notification; several → one summary. */
export function defaultNotifyMode(lessonCount: number): NotifyMode {
  return lessonCount > 1 ? 'summary' : 'each';
}

export interface AnnouncedLesson {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  hebrewDate: string | null;
  isShort: boolean;
}

export interface BatchSummary {
  count: number;
  /** Oldest first; daily lessons before shorts of the same day. */
  lessons: AnnouncedLesson[];
  /** The lesson the notification opens: latest date, daily lesson first. */
  newest: AnnouncedLesson;
  first: AnnouncedLesson;
  last: AnnouncedLesson;
}

export function summarizeBatch(lessons: AnnouncedLesson[]): BatchSummary | null {
  if (lessons.length === 0) return null;
  const ordered = [...lessons].sort((a, b) =>
    a.date === b.date ? Number(a.isShort) - Number(b.isShort) : a.date < b.date ? -1 : 1,
  );
  const lastDate = ordered[ordered.length - 1].date;
  return {
    count: ordered.length,
    lessons: ordered,
    newest: ordered.find((l) => l.date === lastDate)!,
    first: ordered[0],
    last: ordered[ordered.length - 1],
  };
}
