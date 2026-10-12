import { describe, expect, it } from 'vitest';
import { isNavActive } from './nav-items';

describe('isNavActive', () => {
  it('matches home only on the locale root', () => {
    expect(isNavActive('/he', 'he', '')).toBe(true);
    expect(isNavActive('/he/', 'he', '')).toBe(true);
    expect(isNavActive('/he/lessons', 'he', '')).toBe(false);
  });

  it('matches a section and its sub-pages', () => {
    expect(isNavActive('/he/lessons', 'he', '/lessons')).toBe(true);
    expect(isNavActive('/he/lessons/noach-12-10-2026', 'he', '/lessons')).toBe(true);
    expect(isNavActive('/en/tags/x', 'en', '/tags')).toBe(true);
  });

  it('does not match a section that only shares a prefix', () => {
    expect(isNavActive('/he/shortsx', 'he', '/shorts')).toBe(false);
    expect(isNavActive('/he/lessons', 'en', '/lessons')).toBe(false);
  });
});
