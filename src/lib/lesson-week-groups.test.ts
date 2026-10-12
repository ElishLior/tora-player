import { describe, expect, it } from 'vitest';
import { groupLessonsByWeek, jerusalemDateString } from './lesson-week-groups';

// 2026-10-12 is a Monday. Its week starts Sunday 2026-10-11.
const TODAY = '2026-10-12';

function lesson(id: string, date: string, parsha: string | null = null) {
  return { id, date, parsha };
}

describe('groupLessonsByWeek', () => {
  it('labels the current and previous week and groups by Sunday to Saturday', () => {
    const groups = groupLessonsByWeek(
      [
        lesson('a', '2026-10-12', 'נח'), // this week (Mon)
        lesson('b', '2026-10-11', 'נח'), // this week (Sun, first day)
        lesson('c', '2026-10-10', 'בראשית'), // last week (Sat)
        lesson('d', '2026-10-04', 'בראשית'), // last week (Sun)
      ],
      TODAY,
    );
    expect(groups.map((g) => [g.kind, g.start, g.end, g.range])).toEqual([
      ['this-week', '2026-10-11', '2026-10-17', '11.10–17.10.2026'],
      ['last-week', '2026-10-04', '2026-10-10', '04.10–10.10.2026'],
    ]);
    expect(groups[0].lessons.map((l) => l.id)).toEqual(['a', 'b']);
    expect(groups[1].lessons.map((l) => l.id)).toEqual(['c', 'd']);
  });

  it('labels older weeks by their date range and keeps newest first', () => {
    const groups = groupLessonsByWeek(
      [lesson('x', '2026-09-20'), lesson('y', '2026-09-30'), lesson('z', '2026-09-27')],
      TODAY,
    );
    expect(groups.map((g) => [g.kind, g.range])).toEqual([
      ['range', '27.09–03.10.2026'],
      ['range', '20.09–26.09.2026'],
    ]);
    expect(groups[0].lessons.map((l) => l.id)).toEqual(['y', 'z']);
  });

  it('builds a range across a year boundary with both years', () => {
    const groups = groupLessonsByWeek([lesson('n', '2026-01-02')], '2026-01-10');
    expect(groups[0].range).toBe('28.12.2025–03.01.2026');
  });

  it('uses the first reading any lesson in the week carries', () => {
    const groups = groupLessonsByWeek([lesson('a', '2026-10-12', null), lesson('b', '2026-10-11', 'סוכות')], TODAY);
    expect(groups[0].parsha).toBe('סוכות');
    expect(groupLessonsByWeek([lesson('c', '2026-10-12', null)], TODAY)[0].parsha).toBeNull();
  });

  it('returns no groups for no lessons', () => {
    expect(groupLessonsByWeek([], TODAY)).toEqual([]);
  });

  it('does not move a lesson to another week because of the time of day', () => {
    // A Saturday lesson stays in its Sunday-to-Saturday week, whatever the hour.
    const groups = groupLessonsByWeek([lesson('s', '2026-10-17')], '2026-10-17');
    expect(groups[0].kind).toBe('this-week');
    expect(groups[0].start).toBe('2026-10-11');
  });
});

describe('jerusalemDateString', () => {
  it('uses the Jerusalem calendar day, not UTC', () => {
    // 2026-10-11 22:30 UTC is already 2026-10-12 01:30 in Jerusalem (UTC+3 in October).
    expect(jerusalemDateString(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12');
    expect(jerusalemDateString(new Date('2026-10-11T20:30:00Z'))).toBe('2026-10-11');
  });
});
