import { describe, expect, it } from 'vitest';
import {
  dateFromSearchParam,
  lessonsHref,
  matchTags,
  tagFromSearchParam,
  tagFromSegment,
  tagPath,
  tagWeight,
} from './tag-links';

describe('tag URLs', () => {
  it('round-trips Hebrew tags with spaces and reserved characters through the route segment', () => {
    for (const tag of ['אמונה ובטחון', 'עץ חיים/שער א', 'שאלה?', '100% ביטחון', 'a#b']) {
      const segment = tagPath(tag).slice('/tags/'.length);
      expect(segment).not.toMatch(/[\s/?#]/);
      // Next may pass the segment encoded or already decoded.
      expect(tagFromSegment(segment)).toBe(tag);
      expect(tagFromSegment(decodeURIComponent(segment))).toBe(tag);
    }
  });

  it('normalizes the segment and rejects empty tags', () => {
    expect(tagFromSegment(encodeURIComponent('#  פסח  '))).toBe('פסח');
    expect(tagFromSegment('%23')).toBeNull();
  });

  it('reads ?tag= as a normalized tag and ignores empty or repeated values', () => {
    expect(tagFromSearchParam('#אמונה')).toBe('אמונה');
    expect(tagFromSearchParam(['שבת', 'פסח'])).toBe('שבת');
    expect(tagFromSearchParam('   ')).toBeUndefined();
    expect(tagFromSearchParam(undefined)).toBeUndefined();
  });

  it('builds /lessons hrefs that keep every active filter and round-trip the tag', () => {
    const href = lessonsHref({ q: 'שיעור', type: 'סידור', cat: 'c1', tag: 'אמונה & בטחון' });
    const params = new URL(href, 'https://x').searchParams;
    expect(new URL(href, 'https://x').pathname).toBe('/lessons');
    expect(Object.fromEntries(params)).toEqual({ q: 'שיעור', type: 'סידור', cat: 'c1', tag: 'אמונה & בטחון' });
    expect(tagFromSearchParam(params.get('tag') ?? undefined)).toBe('אמונה & בטחון');
    expect(lessonsHref({ tag: undefined, q: '' })).toBe('/lessons');
  });
});

describe('lesson date URLs', () => {
  it.each(['2026-10-07', '2024-02-29', '2000-02-29', '1000-01-01', '9999-12-31'])(
    'accepts a real calendar day: %s',
    (date) => {
      expect(dateFromSearchParam(date)).toBe(date);
    },
  );

  it.each([
    '2026-02-30',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '0000-01-01',
    '0099-01-01',
    '0999-12-31',
    '26-10-07',
    '2026-1-01',
    '2026-10-07T00:00:00Z',
    ' 2026-10-07 ',
    'junk',
    '',
  ])('rejects invalid date input: %s', (date) => {
    expect(dateFromSearchParam(date)).toBeUndefined();
  });

  it('uses only the first repeated parameter, including when that value is invalid', () => {
    expect(dateFromSearchParam(['2026-10-07', '2026-10-08'])).toBe('2026-10-07');
    expect(dateFromSearchParam(['junk', '2026-10-07'])).toBeUndefined();
    expect(dateFromSearchParam([])).toBeUndefined();
    expect(dateFromSearchParam(undefined)).toBeUndefined();
  });

  it('builds date-only links and preserves other filters when clearing either date or tag', () => {
    expect(lessonsHref({ date: '2026-10-07' })).toBe('/lessons?date=2026-10-07');
    const query = { q: 'שיעור', type: 'סידור', cat: 'c1', tag: 'שבת', date: '2026-10-07' };
    const params = (q: typeof query | Partial<typeof query>) =>
      Object.fromEntries(new URL(lessonsHref(q), 'https://x').searchParams);
    expect(params(query)).toEqual(query);
    expect(params({ ...query, date: undefined })).toEqual({ q: 'שיעור', type: 'סידור', cat: 'c1', tag: 'שבת' });
    expect(params({ ...query, tag: undefined })).toEqual({ q: 'שיעור', type: 'סידור', cat: 'c1', date: '2026-10-07' });
    expect(lessonsHref({ date: '2026-02-30' })).toBe('/lessons');
  });
});

describe('matchTags', () => {
  const counts = [
    { tag: 'אמונה ובטחון', lesson_count: 9 },
    { tag: 'Emunah', lesson_count: 3 },
    { tag: 'שבת', lesson_count: 2 },
  ];

  it('matches substrings case-insensitively with an optional #, keeping usage order', () => {
    expect(matchTags(counts, '#בטחון')).toEqual(['אמונה ובטחון']);
    expect(matchTags(counts, 'emu')).toEqual(['Emunah']);
    expect(matchTags(counts, '#')).toEqual([]);
  });
});

describe('tagWeight', () => {
  it('scales from 0 for single-use tags to 4 for the most used tag', () => {
    expect(tagWeight(1, 40)).toBe(0);
    expect(tagWeight(40, 40)).toBe(4);
    expect(tagWeight(5, 5)).toBe(4);
    expect(tagWeight(1, 1)).toBe(0);
    expect(tagWeight(6, 40)).toBeGreaterThan(0);
    expect(tagWeight(6, 40)).toBeLessThan(4);
  });
});
