import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCategoryTree } from '@/lib/category-tree';
import type { Category, CategoryWithChildren } from '@/types/database';
import {
  recordingClient,
  type RecordedResult,
  type RecordedStatement,
  type RecordingClient,
} from '@/lib/supabase/recording-client';

const h = vi.hoisted(() => ({
  admin: true,
  client: null as unknown,
  tree: [] as CategoryWithChildren[],
}));

vi.mock('@/lib/auth/admin', () => ({ isAdmin: async () => h.admin }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => h.client }));
vi.mock('@/lib/supabase/anon', () => ({ revalidateCatalog: vi.fn() }));
vi.mock('@/lib/supabase/queries', () => ({ getCategoriesTree: async () => h.tree }));

import { revalidateCatalog } from '@/lib/supabase/anon';
import { bulkChangeLessonCategories, getLessonCategoryIds, setLessonCategories } from './lesson-categories';

const LESSON = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const A = '00000000-0000-4000-8000-0000000000c1';
const B = '00000000-0000-4000-8000-0000000000c2';
const CHILD = '00000000-0000-4000-8000-0000000000c3';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

function row(id: string, parent_id: string | null, sort_order: number): Category {
  return {
    id,
    name: '',
    hebrew_name: id,
    description: null,
    icon: null,
    sort_order,
    parent_id,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const MISSING_TABLE: RecordedResult = {
  data: null,
  error: { code: 'PGRST205', message: "Could not find the table 'public.lesson_categories' in the schema cache" },
};

let recording: RecordingClient;

function useClient(respond?: (s: RecordedStatement) => RecordedResult) {
  recording = recordingClient(respond);
  h.client = recording.client;
  return recording;
}

beforeEach(() => {
  h.admin = true;
  h.tree = buildCategoryTree([row(A, null, 1), row(B, null, 2), row(CHILD, A, 1)]);
  vi.mocked(revalidateCatalog).mockClear();
  useClient();
});

describe('setLessonCategories', () => {
  it('is for admins only and writes nothing otherwise', async () => {
    h.admin = false;
    expect(await setLessonCategories(LESSON, [A])).toEqual({ error: 'not-admin' });
    expect(recording.statements).toEqual([]);
  });

  it('refuses ids that are not uuids', async () => {
    expect(await setLessonCategories('not-a-lesson', [A])).toEqual({ error: 'invalid' });
    expect(await setLessonCategories(LESSON, ['nope'])).toEqual({ error: 'invalid' });
    expect(recording.statements).toEqual([]);
  });

  it('replaces the lesson categories in order, drops unknown and repeated ids, and revalidates', async () => {
    const result = await setLessonCategories(LESSON, [CHILD, UNKNOWN, B, CHILD]);

    expect(result).toEqual({ categoryIds: [CHILD, B], primaryCategoryId: CHILD, membershipsSaved: true });
    expect(recording.statements[0]).toMatchObject({ table: 'lessons', payload: { category_id: CHILD } });
    expect(recording.statements[1].payload).toEqual([
      { lesson_id: LESSON, category_id: CHILD, position: 0 },
      { lesson_id: LESSON, category_id: B, position: 1 },
    ]);
    expect(recording.statements[2].filters).toEqual([
      ['eq', 'lesson_id', LESSON],
      ['not', 'category_id', 'in', `(${CHILD},${B})`],
    ]);
    expect(revalidateCatalog).toHaveBeenCalledTimes(1);
  });

  it('clears the categories with an empty selection', async () => {
    expect(await setLessonCategories(LESSON, [])).toEqual({
      categoryIds: [],
      primaryCategoryId: null,
      membershipsSaved: true,
    });
    expect(recording.statements[0].payload).toEqual({ category_id: null });
  });

  it('saves the primary only, and says so, while migration 026 is missing', async () => {
    useClient((s) => (s.table === 'lesson_categories' ? MISSING_TABLE : {}));

    const result = await setLessonCategories(LESSON, [A, B]);

    expect(result).toEqual({ categoryIds: [A, B], primaryCategoryId: A, membershipsSaved: false });
    expect(recording.statements[0].payload).toEqual({ category_id: A });
  });

  it('reports a failed write as failed, without revalidating', async () => {
    useClient((s) => (s.table === 'lessons' ? { error: { code: '42501', message: 'denied' } } : {}));

    expect(await setLessonCategories(LESSON, [A])).toEqual({ error: 'failed' });
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });
});

describe('bulkChangeLessonCategories', () => {
  it('needs admin, lesson ids, and a category for add and remove', async () => {
    expect(await bulkChangeLessonCategories([LESSON], 'add', null)).toEqual({ error: 'invalid' });
    expect(await bulkChangeLessonCategories([LESSON], 'remove', null)).toEqual({ error: 'invalid' });
    expect(await bulkChangeLessonCategories([], 'set', A)).toEqual({ error: 'invalid' });
    h.admin = false;
    expect(await bulkChangeLessonCategories([LESSON], 'set', A)).toEqual({ error: 'not-admin' });
    expect(recording.statements).toEqual([]);
  });

  it('set replaces the category of every selected lesson (and clears with null)', async () => {
    expect(await bulkChangeLessonCategories([LESSON, OTHER], 'set', A)).toEqual({ membershipsSaved: true });
    expect(recording.statements[0]).toMatchObject({ table: 'lessons', payload: { category_id: A } });
    expect(recording.statements[1].filters).toEqual([
      ['in', 'lesson_id', [LESSON, OTHER]],
      ['neq', 'category_id', A],
    ]);

    useClient();
    expect(await bulkChangeLessonCategories([LESSON], 'set', null)).toEqual({ membershipsSaved: true });
    expect(recording.statements[0].payload).toEqual({ category_id: null });
  });

  it('add writes one membership per lesson and leaves the others alone', async () => {
    expect(await bulkChangeLessonCategories([LESSON, OTHER], 'add', B)).toEqual({ membershipsSaved: true });
    expect(recording.statements.some((s) => s.table === 'lesson_categories' && s.op === 'upsert')).toBe(true);
    expect(recording.statements.some((s) => s.op === 'delete')).toBe(false);
  });

  it('remove deletes that membership for each selected lesson', async () => {
    expect(await bulkChangeLessonCategories([LESSON], 'remove', B)).toEqual({ membershipsSaved: true });
    expect(recording.statements[0]).toMatchObject({
      table: 'lesson_categories',
      op: 'delete',
      filters: [
        ['in', 'lesson_id', [LESSON]],
        ['eq', 'category_id', B],
      ],
    });
  });
});

describe('getLessonCategoryIds', () => {
  it('returns the memberships, primary first', async () => {
    useClient((s) =>
      s.table === 'lesson_categories'
        ? { data: [{ category_id: CHILD }, { category_id: B }] }
        : { data: { category_id: CHILD } },
    );
    expect(await getLessonCategoryIds(LESSON)).toEqual({ categoryIds: [CHILD, B] });
  });

  it('falls back to the primary category while migration 026 is missing', async () => {
    useClient((s) => (s.table === 'lesson_categories' ? MISSING_TABLE : { data: { category_id: A } }));
    expect(await getLessonCategoryIds(LESSON)).toEqual({ categoryIds: [A] });
  });

  it('is for admins only', async () => {
    h.admin = false;
    expect(await getLessonCategoryIds(LESSON)).toEqual({ error: 'not-admin' });
  });
});
