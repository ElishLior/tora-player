/*
 * Groups a list of lessons by the week (Sunday to Saturday) of their stored
 * date. Date-only arithmetic: a lesson's `date` is a calendar day (YYYY-MM-DD),
 * never a timestamp, so no time zone can move it to another week.
 */

export type WeekKind = 'this-week' | 'last-week' | 'range';

export interface WeekGroup<T> {
  /** The Sunday that starts the week (YYYY-MM-DD); unique per group. */
  key: string;
  kind: WeekKind;
  start: string;
  end: string;
  /** Numeric date range of the week, e.g. "21.09–27.09.2026". */
  range: string;
  /** The first lesson's stored reading that the group carries, or null. */
  parsha: string | null;
  /** Newest first. */
  lessons: T[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}

function formatDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  return formatDay(parseDay(day) + days * DAY_MS);
}

function weekStart(day: string): string {
  return addDays(day, -new Date(parseDay(day)).getUTCDay());
}

function numericRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = end.split('-');
  const from = sy === ey ? `${sd}.${sm}` : `${sd}.${sm}.${sy}`;
  return `${from}–${ed}.${em}.${ey}`;
}

/**
 * Today's calendar date in Asia/Jerusalem as YYYY-MM-DD. Call it on the server:
 * the grouping below is only correct for the same "today" the listener sees.
 */
export function jerusalemDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Newest weeks first. Each group is labelled as the current week, the week
 * before, or another week (by its date range). Lessons inside a group are
 * newest first; the group carries the first reading any of its lessons has.
 */
export function groupLessonsByWeek<T extends { date: string; parsha?: string | null }>(
  lessons: readonly T[],
  today: string,
): WeekGroup<T>[] {
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const byWeek = new Map<string, T[]>();

  for (const lesson of [...lessons].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))) {
    const key = weekStart(lesson.date);
    const group = byWeek.get(key);
    if (group) group.push(lesson);
    else byWeek.set(key, [lesson]);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([start, weekLessons]) => {
      const end = addDays(start, 6);
      const kind: WeekKind = start === thisWeek ? 'this-week' : start === lastWeek ? 'last-week' : 'range';
      return {
        key: start,
        kind,
        start,
        end,
        range: numericRange(start, end),
        parsha: weekLessons.find((lesson) => lesson.parsha)?.parsha ?? null,
        lessons: weekLessons,
      };
    });
}
