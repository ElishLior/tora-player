import { describe, expect, it } from 'vitest';
import { pickLastPlayed, sortByRecency } from './last-played';
import type { LocalProgress } from '@/stores/progress-store';

function entry(lessonId: string, lastPlayed: string, completed = false): LocalProgress {
  return { lessonId, position: 10, lastPlayed, completed };
}

describe('pickLastPlayed', () => {
  it('returns null when nothing was played', () => {
    expect(pickLastPlayed({})).toBeNull();
  });

  it('picks the most recent entry that is not heard to the end', () => {
    const map = {
      a: entry('a', '2026-10-10T10:00:00Z'),
      b: entry('b', '2026-10-12T10:00:00Z', true),
      c: entry('c', '2026-10-11T10:00:00Z'),
    };
    expect(pickLastPlayed(map)?.lessonId).toBe('c');
  });

  it('falls back to the most recent entry when every lesson is heard', () => {
    const map = {
      a: entry('a', '2026-10-10T10:00:00Z', true),
      b: entry('b', '2026-10-12T10:00:00Z', true),
    };
    expect(pickLastPlayed(map)?.lessonId).toBe('b');
  });

  it('never returns an entry without a lesson id', () => {
    const map = { x: entry('', '2026-10-12T10:00:00Z') };
    expect(pickLastPlayed(map)).toBeNull();
  });
});

describe('sortByRecency', () => {
  it('sorts invalid dates last and does not mutate the input', () => {
    const input = [entry('bad', 'nope'), entry('new', '2026-10-12T10:00:00Z'), entry('old', '2026-10-01T10:00:00Z')];
    expect(sortByRecency(input).map((e) => e.lessonId)).toEqual(['new', 'old', 'bad']);
    expect(input[0].lessonId).toBe('bad');
  });
});
