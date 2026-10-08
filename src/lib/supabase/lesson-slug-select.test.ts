import { expect, it, vi } from 'vitest';
import { withLessonSlugSelect } from './lesson-slug-select';

it('retries a pre-migration select without slug but preserves embeds and columns', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column lessons.slug does not exist' } })
    .mockResolvedValueOnce({ data: [{ id: 'old' }], error: null });
  expect(await withLessonSlugSelect('id, slug, playlist_lessons(lesson:lessons(id, slug, title))', read)).toEqual({
    data: [{ id: 'old' }],
    error: null,
  });
  expect(read.mock.calls.map(([columns]) => columns)).toEqual([
    'id, slug, playlist_lessons(lesson:lessons(id, slug, title))',
    'id, playlist_lessons(lesson:lessons(id, title))',
  ]);
});
it('does not retry another query error', async () => {
  const read = vi
    .fn()
    .mockResolvedValue({ data: null, error: { code: '42703', message: 'column tags does not exist' } });
  await withLessonSlugSelect('id, slug, tags', read);
  expect(read).toHaveBeenCalledTimes(1);
});
