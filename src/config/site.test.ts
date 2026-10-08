import { describe, expect, it } from 'vitest';
import { lessonPath, lessonUrl, SITE_URL } from './site';

describe('lesson URL builders', () => {
  it('keeps plain IDs and old callers', () => {
    expect(lessonPath('old-id')).toBe('/lessons/old-id');
    expect(lessonUrl('old-id')).toBe(`${SITE_URL}/he/lessons/old-id`);
  });
  it.each([null, undefined, ''])('falls back to UUID for slug %s', (slug) => {
    expect(lessonPath({ id: 'uuid', slug })).toBe('/lessons/uuid');
  });
  it('prefers a slug and localizes absolute links', () => {
    expect(lessonPath({ id: 'uuid', slug: 'sukkot-25-09-2026' })).toBe('/lessons/sukkot-25-09-2026');
    expect(lessonUrl({ id: 'uuid', slug: 'sukkot-25-09-2026' }, 'en')).toBe(`${SITE_URL}/en/lessons/sukkot-25-09-2026`);
  });
  it('encodes the segment instead of accepting another path or query', () => {
    expect(lessonPath('space /?#')).toBe('/lessons/space%20%2F%3F%23');
  });
});
