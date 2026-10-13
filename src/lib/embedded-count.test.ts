import { describe, expect, it } from 'vitest';
import { embeddedCount } from './embedded-count';

describe('embeddedCount', () => {
  it('reads the count of a PostgREST embedded aggregate', () => {
    expect(embeddedCount({ id: 's1', lessons: [{ count: 12 }] }, 'lessons')).toBe(12);
    expect(embeddedCount({ playlist_lessons: [{ count: 0 }] }, 'playlist_lessons')).toBe(0);
  });

  it('is unknown (null), not zero, when the relation was never selected', () => {
    expect(embeddedCount({ id: 's1' }, 'lessons')).toBeNull();
    expect(embeddedCount({ lessons: null }, 'lessons')).toBeNull();
    expect(embeddedCount({ lessons: [] }, 'lessons')).toBeNull();
  });

  it('ignores a malformed count', () => {
    expect(embeddedCount({ lessons: [{ count: '3' }] }, 'lessons')).toBeNull();
  });
});
