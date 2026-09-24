import { describe, expect, it } from 'vitest';
import { lessonsHref, matchTags, tagFromSearchParam, tagFromSegment, tagPath, tagWeight } from './tag-links';

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
