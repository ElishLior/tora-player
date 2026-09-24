import { describe, expect, it } from 'vitest';
import {
  fillDailySeries,
  parseStatsPeriod,
  parseUsersQuery,
  queryUsers,
  toStatsDay,
  type AdminUserRow,
} from './admin-insights';

describe('toStatsDay', () => {
  it('buckets by the Israel calendar day, not UTC', () => {
    // 22:30 UTC is already the next day in Israel (UTC+3 in summer, +2 in winter).
    expect(toStatsDay(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    expect(toStatsDay(new Date('2026-01-01T21:59:00Z'))).toBe('2026-01-01');
    expect(toStatsDay(new Date('2026-01-01T22:00:00Z'))).toBe('2026-01-02');
  });
});

describe('fillDailySeries', () => {
  const empty = (day: string) => ({ day, count: 0 });

  it('returns every day of the window oldest first, filling gaps', () => {
    const series = fillDailySeries([{ day: '2026-03-01', count: 4 }], 3, '2026-03-02', empty);
    expect(series).toEqual([
      { day: '2026-02-28', count: 0 },
      { day: '2026-03-01', count: 4 },
      { day: '2026-03-02', count: 0 },
    ]);
  });

  it('does not skip or repeat days across a DST change', () => {
    // Israel moves clocks forward on 2026-03-27.
    const days = fillDailySeries([], 5, '2026-03-29', empty).map((row) => row.day);
    expect(days).toEqual(['2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29']);
  });

  it('drops rows outside the window', () => {
    const series = fillDailySeries([{ day: '2026-01-01', count: 9 }], 2, '2026-03-02', empty);
    expect(series.every((row) => row.count === 0)).toBe(true);
  });
});

describe('parseStatsPeriod', () => {
  it('accepts only the offered periods', () => {
    expect(parseStatsPeriod('7')).toBe(7);
    expect(parseStatsPeriod(['90'])).toBe(90);
    expect(parseStatsPeriod('365')).toBe(30);
    expect(parseStatsPeriod(undefined)).toBe(30);
  });
});

function user(id: string, overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id,
    email: `${id}@example.com`,
    displayName: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastSignInAt: null,
    lastListenAt: null,
    listens: 0,
    listenedSeconds: 0,
    notifyNewLessons: true,
    pushSubscriptions: 0,
    role: 'user',
    envAdmin: false,
    ...overrides,
  };
}

describe('queryUsers', () => {
  const rows = [
    user('dana', { displayName: 'דנה', createdAt: '2026-01-03T00:00:00Z', listenedSeconds: 50, lastListenAt: '2026-02-01T00:00:00Z' }),
    user('avi', { createdAt: '2026-01-02T00:00:00Z', listenedSeconds: 500 }),
    user('moshe', { createdAt: '2026-01-01T00:00:00Z', lastListenAt: '2026-03-01T00:00:00Z' }),
  ];

  it('searches email and display name case-insensitively', () => {
    expect(queryUsers(rows, { ...parseUsersQuery({}), q: 'AVI' }).rows.map((r) => r.id)).toEqual(['avi']);
    expect(queryUsers(rows, { ...parseUsersQuery({}), q: 'דנה' }).rows.map((r) => r.id)).toEqual(['dana']);
  });

  it('sorts in both directions and keeps missing values last', () => {
    const byListen = (dir: 'asc' | 'desc') =>
      queryUsers(rows, { q: '', sort: 'lastListen', dir, page: 1 }).rows.map((r) => r.id);
    expect(byListen('desc')).toEqual(['moshe', 'dana', 'avi']);
    expect(byListen('asc')).toEqual(['dana', 'moshe', 'avi']);
    expect(queryUsers(rows, { q: '', sort: 'listened', dir: 'desc', page: 1 }).rows[0].id).toBe('avi');
  });

  it('paginates and clamps the page to the last one', () => {
    const many = Array.from({ length: 5 }, (_, i) => user(`u${i}`, { createdAt: `2026-01-0${i + 1}T00:00:00Z` }));
    const result = queryUsers(many, { q: '', sort: 'created', dir: 'desc', page: 9 }, 2);
    expect(result).toMatchObject({ total: 5, page: 3, pageCount: 3 });
    expect(result.rows.map((r) => r.id)).toEqual(['u0']);
  });

  it('parses untrusted search params into a valid query', () => {
    expect(parseUsersQuery({ sort: 'password', dir: 'sideways', page: '-3', q: '  x ' })).toEqual({
      q: 'x',
      sort: 'created',
      dir: 'desc',
      page: 1,
    });
  });
});
