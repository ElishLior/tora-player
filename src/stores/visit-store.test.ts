import { describe, expect, it } from 'vitest';
import { isNewSince, touchVisit, VISIT_GAP_MS } from './visit-store';

const at = (iso: string) => new Date(iso);

describe('touchVisit', () => {
  it('has no "new since" threshold on the first visit', () => {
    expect(touchVisit({ previousVisitAt: null, lastVisitAt: null }, at('2026-09-01T08:00:00Z'))).toEqual({
      previousVisitAt: null,
      lastVisitAt: '2026-09-01T08:00:00.000Z',
    });
  });

  it('keeps the threshold while the visit goes on (reloads, short app switches)', () => {
    const times = { previousVisitAt: '2026-08-30T20:00:00.000Z', lastVisitAt: '2026-09-01T08:00:00.000Z' };
    const now = new Date(Date.parse(times.lastVisitAt) + VISIT_GAP_MS);
    expect(touchVisit(times, now)).toEqual({
      previousVisitAt: '2026-08-30T20:00:00.000Z',
      lastVisitAt: now.toISOString(),
    });
  });

  it('starts a new visit after a long pause, measured from when the last one was seen', () => {
    const times = { previousVisitAt: '2026-08-30T20:00:00.000Z', lastVisitAt: '2026-09-01T08:00:00.000Z' };
    const now = new Date(Date.parse(times.lastVisitAt) + VISIT_GAP_MS + 1);
    expect(touchVisit(times, now).previousVisitAt).toBe('2026-09-01T08:00:00.000Z');
  });
});

describe('isNewSince', () => {
  it('marks only lessons created after the previous visit', () => {
    expect(isNewSince('2026-09-01T09:00:00Z', '2026-09-01T08:00:00.000Z')).toBe(true);
    expect(isNewSince('2026-09-01T08:00:00Z', '2026-09-01T08:00:00.000Z')).toBe(false);
    expect(isNewSince('2026-09-01T09:00:00Z', null)).toBe(false);
    expect(isNewSince(undefined, '2026-09-01T08:00:00.000Z')).toBe(false);
  });
});
