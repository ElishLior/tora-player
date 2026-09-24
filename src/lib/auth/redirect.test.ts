import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './redirect';

describe('safeRedirectPath', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeRedirectPath('/he/lessons/abc?start=30#top', '/he')).toBe('/he/lessons/abc?start=30#top');
  });

  it('falls back for anything that could leave the site', () => {
    for (const next of [
      null,
      '',
      'https://evil.com',
      '//evil.com/he',
      '/\\evil.com',
      '/\t/evil.com',
      'javascript:alert(1)',
      'he/lessons',
    ]) {
      expect(safeRedirectPath(next, '/he')).toBe('/he');
    }
  });
});
