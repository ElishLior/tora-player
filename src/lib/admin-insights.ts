/**
 * Pure helpers shared by the admin stats and users pages (no I/O): report
 * periods, day bucketing in the app's time zone, and the users table query.
 */

/** Days are bucketed in Israel time, matching the SQL admin_* functions. */
export const STATS_TIME_ZONE = 'Asia/Jerusalem';
export const STATS_PERIODS = [7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];
export const DEFAULT_STATS_PERIOD: StatsPeriod = 30;

export function parseStatsPeriod(value: string | string[] | undefined): StatsPeriod {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return STATS_PERIODS.find((period) => period === days) ?? DEFAULT_STATS_PERIOD;
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STATS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar day (YYYY-MM-DD) of `date` in Israel time. */
export function toStatsDay(date: Date): string {
  return dayFormatter.format(date);
}

/**
 * The `days` calendar days ending with `today` (YYYY-MM-DD), oldest first,
 * with each day's row from `rows` or `empty(day)` when there was none.
 */
export function fillDailySeries<T extends { day: string }>(
  rows: readonly T[],
  days: number,
  today: string,
  empty: (day: string) => T,
): T[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const cursor = new Date(`${today}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));
  const series: T[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = cursor.toISOString().slice(0, 10);
    series.push(byDay.get(day) ?? empty(day));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

// ==================== Users table ====================

export interface AdminUserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  lastListenAt: string | null;
  listens: number;
  listenedSeconds: number;
  notifyNewLessons: boolean;
  pushSubscriptions: number;
  /** profiles.role — the part admins can change here. */
  role: 'user' | 'admin';
  /** Listed in ADMIN_EMAILS: admin regardless of role. */
  envAdmin: boolean;
}

export const USER_SORT_KEYS = ['created', 'lastSignIn', 'lastListen', 'listened', 'email'] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';
export const USERS_PAGE_SIZE = 25;

export interface UsersQuery {
  q: string;
  sort: UserSortKey;
  dir: SortDirection;
  page: number;
}

type SearchParamValue = string | string[] | undefined;

/** Parses untrusted search params (also reachable through the server action). */
export function parseUsersQuery(params: Record<string, SearchParamValue>): UsersQuery {
  const first = (value: unknown) => {
    const single = Array.isArray(value) ? value[0] : value;
    return typeof single === 'string' ? single : '';
  };
  const sort = USER_SORT_KEYS.find((key) => key === first(params.sort)) ?? 'created';
  const dir: SortDirection = first(params.dir) === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Math.floor(Number(first(params.page))) || 1);
  return { q: first(params.q).trim().slice(0, 100), sort, dir, page };
}

function sortValue(row: AdminUserRow, sort: UserSortKey): string | number | null {
  switch (sort) {
    case 'created':
      return row.createdAt;
    case 'lastSignIn':
      return row.lastSignInAt;
    case 'lastListen':
      return row.lastListenAt;
    case 'listened':
      return row.listenedSeconds;
    case 'email':
      return row.email?.toLowerCase() ?? null;
  }
}

/**
 * Filters by email/name substring, sorts (missing values always last, ties by
 * newest account) and returns the requested page, clamped to the last page.
 */
export function queryUsers(
  rows: readonly AdminUserRow[],
  query: UsersQuery,
  pageSize: number = USERS_PAGE_SIZE,
): { rows: AdminUserRow[]; total: number; page: number; pageCount: number } {
  const needle = query.q.toLowerCase();
  const matching = needle
    ? rows.filter(
        (row) =>
          row.email?.toLowerCase().includes(needle) || row.displayName?.toLowerCase().includes(needle),
      )
    : [...rows];

  const direction = query.dir === 'asc' ? 1 : -1;
  matching.sort((a, b) => {
    const left = sortValue(a, query.sort);
    const right = sortValue(b, query.sort);
    if (left !== right) {
      if (left === null) return 1;
      if (right === null) return -1;
      return (left < right ? -1 : 1) * direction;
    }
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return {
    rows: matching.slice((page - 1) * pageSize, page * pageSize),
    total: matching.length,
    page,
    pageCount,
  };
}
