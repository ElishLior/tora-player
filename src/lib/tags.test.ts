import { describe, expect, it } from 'vitest';
import { MAX_TAGS, normalizeTag, normalizeTags } from './tags';

describe('normalizeTag', () => {
  it('strips hashes and collapses whitespace, keeping Hebrew as typed', () => {
    expect(normalizeTag('  #ליקוטי   מוהר"ן ')).toBe('ליקוטי מוהר"ן');
  });

  it('rejects empty and over-long tags', () => {
    expect(normalizeTag('###  ')).toBeNull();
    expect(normalizeTag('א'.repeat(41))).toBeNull();
  });
});

describe('normalizeTags', () => {
  it('de-duplicates after normalization and caps the list', () => {
    expect(normalizeTags(['אהבה', '#אהבה', ' אהבה '])).toEqual(['אהבה']);
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `תג ${i}`))).toHaveLength(MAX_TAGS);
  });
});
