import { describe, expect, it, vi } from 'vitest';
import {
  categoryScope,
  CATEGORY_SCOPE_EMBED,
  withCategoryScope,
  type CategoryScope,
  type ScopeFilterable,
} from './category-scope';
import { isMissingLessonCategories } from './lesson-route';

const SCOPE = ['cat-1', 'cat-2'];

interface ReadResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}
type Read = (scope: CategoryScope) => Promise<ReadResult>;

/** Records the filter calls a query gets; `in` returns the same builder, like PostgREST. */
class RecordingQuery implements ScopeFilterable<RecordingQuery> {
  calls: unknown[][] = [];
  in(column: string, values: readonly string[]) {
    this.calls.push(['in', column, [...values]]);
    return this;
  }
}

describe('categoryScope', () => {
  it('membership mode adds the inner embed and filters on its alias', () => {
    const scope = categoryScope(SCOPE, 'membership');
    expect(scope.select('id, title')).toBe(`id, title, ${CATEGORY_SCOPE_EMBED}`);
    expect(CATEGORY_SCOPE_EMBED).toContain('lesson_categories!inner(category_id)');

    const query = new RecordingQuery();
    scope.filter(query);
    expect(query.calls).toEqual([['in', 'category_scope.category_id', SCOPE]]);
  });

  it('primary mode leaves the select alone and filters the lesson column', () => {
    const scope = categoryScope(SCOPE, 'primary');
    expect(scope.select('id, title')).toBe('id, title');

    const query = new RecordingQuery();
    scope.filter(query);
    expect(query.calls).toEqual([['in', 'category_id', SCOPE]]);
  });
});

describe('withCategoryScope', () => {
  it('returns the membership read when it works, without a second read', async () => {
    const read = vi.fn<Read>(async () => ({ data: [{ id: 'l1' }], error: null }));
    const result = await withCategoryScope(SCOPE, read);

    expect(result.data).toEqual([{ id: 'l1' }]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0].mode).toBe('membership');
  });

  it('reads again in primary mode when the lesson_categories table is missing', async () => {
    const read = vi
      .fn<Read>()
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST200', message: "Could not find a relationship between 'lessons' and 'lesson_categories'" },
      })
      .mockResolvedValueOnce({ data: [{ id: 'l2' }], error: null });

    const result = await withCategoryScope(SCOPE, read);

    expect(result.data).toEqual([{ id: 'l2' }]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1][0].mode).toBe('primary');
  });

  it('returns any other error as it is, without retrying', async () => {
    const error = { code: '57014', message: 'canceling statement due to statement timeout' };
    const read = vi.fn<Read>(async () => ({ data: null, error }));

    const result = await withCategoryScope(SCOPE, read);

    expect(result.error).toEqual(error);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('isMissingLessonCategories', () => {
  it('recognises the missing-table and missing-relationship errors for lesson_categories', () => {
    expect(
      isMissingLessonCategories({ code: '42P01', message: 'relation "public.lesson_categories" does not exist' }),
    ).toBe(true);
    expect(
      isMissingLessonCategories({ code: 'PGRST205', message: "Could not find the table 'public.lesson_categories'" }),
    ).toBe(true);
    expect(
      isMissingLessonCategories({
        code: 'PGRST200',
        message: "relationship between 'lessons' and 'lesson_categories'",
      }),
    ).toBe(true);
  });

  it('does not treat other errors as a missing table', () => {
    expect(isMissingLessonCategories({ code: '42P01', message: 'relation "public.lessons" does not exist' })).toBe(
      false,
    );
    expect(isMissingLessonCategories({ code: '23505', message: 'duplicate key value on lesson_categories' })).toBe(
      false,
    );
  });
});
