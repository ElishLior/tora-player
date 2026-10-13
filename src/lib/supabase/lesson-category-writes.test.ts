import { describe, expect, it } from 'vitest';
import {
  addLessonCategory,
  promoteOrphanedPrimaries,
  readLessonCategoryIds,
  removeLessonCategory,
  setLessonCategoryOnMany,
  writeLessonCategories,
} from './lesson-category-writes';
import { recordingClient, type RecordedResult, type RecordedStatement } from './recording-client';

const L1 = '00000000-0000-4000-8000-0000000000a1';
const L2 = '00000000-0000-4000-8000-0000000000a2';
const L3 = '00000000-0000-4000-8000-0000000000a3';
const A = '00000000-0000-4000-8000-0000000000c1';
const B = '00000000-0000-4000-8000-0000000000c2';
const C = '00000000-0000-4000-8000-0000000000c3';

const MISSING_TABLE: RecordedResult = {
  data: null,
  error: { code: 'PGRST205', message: "Could not find the table 'public.lesson_categories' in the schema cache" },
};

/** Ops of one table, in the order they ran. */
function opsOf(statements: RecordedStatement[], table: string) {
  return statements.filter((s) => s.table === table).map((s) => s.op);
}

describe('writeLessonCategories', () => {
  it('writes the primary first, then upserts the selection with positions, then drops the rest', async () => {
    const { client, statements } = recordingClient();

    const result = await writeLessonCategories(client, L1, [A, B]);

    expect(result).toEqual({ membershipsSaved: true, primaryCategoryId: A });
    expect(statements.map((s) => [s.table, s.op])).toEqual([
      ['lessons', 'update'],
      ['lesson_categories', 'upsert'],
      ['lesson_categories', 'delete'],
    ]);
    expect(statements[0]).toMatchObject({ payload: { category_id: A }, filters: [['eq', 'id', L1]] });
    expect(statements[1].payload).toEqual([
      { lesson_id: L1, category_id: A, position: 0 },
      { lesson_id: L1, category_id: B, position: 1 },
    ]);
    expect(statements[1].options).toEqual({ onConflict: 'lesson_id,category_id' });
    expect(statements[2].filters).toEqual([
      ['eq', 'lesson_id', L1],
      ['not', 'category_id', 'in', `(${A},${B})`],
    ]);
  });

  it('keeps the old primary in the set when a reordering swaps the primary (the upsert runs before the delete)', async () => {
    const { client, statements } = recordingClient();

    await writeLessonCategories(client, L1, [B, A]);

    // The primary moves A -> B first, which removes A's row by trigger; the upsert puts A back at position 1.
    expect(statements[0].payload).toEqual({ category_id: B });
    expect(statements[1].payload).toEqual([
      { lesson_id: L1, category_id: B, position: 0 },
      { lesson_id: L1, category_id: A, position: 1 },
    ]);
    expect(statements[2].filters).toEqual([
      ['eq', 'lesson_id', L1],
      ['not', 'category_id', 'in', `(${B},${A})`],
    ]);
  });

  it('clears the lesson when the selection is empty, with no upsert', async () => {
    const { client, statements } = recordingClient();

    const result = await writeLessonCategories(client, L1, []);

    expect(result).toEqual({ membershipsSaved: true, primaryCategoryId: null });
    expect(statements.map((s) => [s.table, s.op])).toEqual([
      ['lessons', 'update'],
      ['lesson_categories', 'delete'],
    ]);
    expect(statements[0].payload).toEqual({ category_id: null });
    expect(statements[1].filters).toEqual([['eq', 'lesson_id', L1]]);
  });

  it('saves only the primary when migration 026 is missing', async () => {
    const { client, statements } = recordingClient((s) => (s.table === 'lesson_categories' ? MISSING_TABLE : {}));

    const result = await writeLessonCategories(client, L1, [A, B]);

    expect(result).toEqual({ membershipsSaved: false, primaryCategoryId: A });
    expect(statements[0].payload).toEqual({ category_id: A });
    expect(opsOf(statements, 'lesson_categories')).toEqual(['upsert']);
  });

  it('returns other write errors', async () => {
    const { client } = recordingClient((s) =>
      s.table === 'lessons' ? { error: { code: '42501', message: 'denied' } } : {},
    );

    expect(await writeLessonCategories(client, L1, [A])).toEqual({ error: 'denied' });
  });
});

describe('addLessonCategory', () => {
  it('makes the category the primary where a lesson has none, and adds it elsewhere without moving the others', async () => {
    const { client, statements } = recordingClient();

    const result = await addLessonCategory(client, [L1, L2], C);

    expect(result).toMatchObject({ membershipsSaved: true });
    expect(statements[0]).toMatchObject({
      table: 'lessons',
      op: 'update',
      payload: { category_id: C },
      filters: [
        ['in', 'id', [L1, L2]],
        ['is', 'category_id', null],
      ],
    });
    expect(statements[1]).toMatchObject({
      table: 'lesson_categories',
      op: 'upsert',
      options: { onConflict: 'lesson_id,category_id', ignoreDuplicates: true },
    });
    expect(statements[1].payload).toEqual([
      { lesson_id: L1, category_id: C, position: 1 },
      { lesson_id: L2, category_id: C, position: 1 },
    ]);
  });

  it('reports a missing migration 026 without failing', async () => {
    const { client } = recordingClient((s) => (s.table === 'lesson_categories' ? MISSING_TABLE : {}));
    expect(await addLessonCategory(client, [L1], C)).toMatchObject({ membershipsSaved: false });
  });
});

describe('removeLessonCategory', () => {
  it("deletes the membership and promotes each lesson's next category to primary", async () => {
    const { client, statements } = recordingClient((s) => {
      if (s.table === 'lessons' && s.op === 'select') return { data: [{ id: L1 }, { id: L2 }] };
      if (s.table === 'lesson_categories' && s.op === 'select') {
        // Ordered by position, then created_at: L1 keeps B first; L2 has nothing left.
        return {
          data: [
            { lesson_id: L1, category_id: B },
            { lesson_id: L1, category_id: C },
          ],
        };
      }
      return {};
    });

    const result = await removeLessonCategory(client, [L1, L2, L3], A);

    expect(result).toEqual({ membershipsSaved: true, primaryCategoryId: null });
    expect(statements[0]).toMatchObject({
      table: 'lesson_categories',
      op: 'delete',
      filters: [
        ['in', 'lesson_id', [L1, L2, L3]],
        ['eq', 'category_id', A],
      ],
    });
    const updates = statements.filter((s) => s.op === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ payload: { category_id: B }, filters: [['in', 'id', [L1]]] });
    expect(updates[1]).toMatchObject({ payload: { category_id: null }, filters: [['in', 'id', [L2]]] });
  });

  it('does nothing more when none of the lessons had this category as primary', async () => {
    const { client, statements } = recordingClient((s) =>
      s.op === 'select' && s.table === 'lessons' ? { data: [] } : {},
    );

    await removeLessonCategory(client, [L1], B);

    expect(statements.map((s) => s.op)).toEqual(['delete', 'select']);
  });

  it('before migration 026, clears only the lessons whose primary is this category', async () => {
    const { client, statements } = recordingClient((s) => (s.table === 'lesson_categories' ? MISSING_TABLE : {}));

    const result = await removeLessonCategory(client, [L1], A);

    expect(result).toEqual({ membershipsSaved: false, primaryCategoryId: null });
    expect(statements[1]).toMatchObject({
      table: 'lessons',
      op: 'update',
      payload: { category_id: null },
      filters: [
        ['in', 'id', [L1]],
        ['eq', 'category_id', A],
      ],
    });
  });
});

describe('setLessonCategoryOnMany', () => {
  it('replaces the categories of many lessons with one', async () => {
    const { client, statements } = recordingClient();

    const result = await setLessonCategoryOnMany(client, [L1, L2], A);

    expect(result).toEqual({ membershipsSaved: true, primaryCategoryId: A });
    expect(statements[0]).toMatchObject({
      table: 'lessons',
      payload: { category_id: A },
      filters: [['in', 'id', [L1, L2]]],
    });
    expect(statements[1]).toMatchObject({
      table: 'lesson_categories',
      op: 'delete',
      filters: [
        ['in', 'lesson_id', [L1, L2]],
        ['neq', 'category_id', A],
      ],
    });
  });

  it('clears the categories with null, removing every membership', async () => {
    const { client, statements } = recordingClient();

    await setLessonCategoryOnMany(client, [L1], null);

    expect(statements[1].filters).toEqual([['in', 'lesson_id', [L1]]]);
  });
});

describe('readLessonCategoryIds', () => {
  it('returns the memberships in order', async () => {
    const { client, statements } = recordingClient(() => ({ data: [{ category_id: A }, { category_id: B }] }));

    expect(await readLessonCategoryIds(client, L1)).toEqual([A, B]);
    expect(statements[0].filters).toEqual([
      ['select', 'category_id'],
      ['eq', 'lesson_id', L1],
      ['order', 'position', { ascending: true }],
      ['order', 'created_at', { ascending: true }],
    ]);
  });

  it('returns null while migration 026 is missing, and throws other errors', async () => {
    expect(await readLessonCategoryIds(recordingClient(() => MISSING_TABLE).client, L1)).toBeNull();
    await expect(
      readLessonCategoryIds(recordingClient(() => ({ error: { code: '57014', message: 'timeout' } })).client, L1),
    ).rejects.toEqual({ code: '57014', message: 'timeout' });
  });
});

describe('promoteOrphanedPrimaries', () => {
  it('gives each lesson left without a primary its first remaining category', async () => {
    const { client, statements } = recordingClient((s) => {
      if (s.table === 'lesson_categories' && s.op === 'select' && s.filters.some((f) => f[0] === 'is')) {
        return { data: [{ lesson_id: L1 }, { lesson_id: L2 }] };
      }
      if (s.table === 'lesson_categories' && s.op === 'select') {
        return { data: [{ lesson_id: L1, category_id: B }, { lesson_id: L2, category_id: C }] };
      }
      return {};
    });

    expect(await promoteOrphanedPrimaries(client)).toEqual({ promoted: 2 });

    const orphanRead = statements[0];
    expect(orphanRead.filters).toContainEqual(['is', 'lesson.category_id', null]);
    const updates = statements.filter((s) => s.op === 'update');
    expect(updates.map((u) => [u.payload, u.filters])).toEqual([
      [{ category_id: B }, [['in', 'id', [L1]]]],
      [{ category_id: C }, [['in', 'id', [L2]]]],
    ]);
  });

  it('does nothing when no lesson lost its primary', async () => {
    const { client, statements } = recordingClient(() => ({ data: [] }));
    expect(await promoteOrphanedPrimaries(client)).toEqual({ promoted: 0 });
    expect(statements.map((s) => s.op)).toEqual(['select']);
  });

  it('is a no-op while migration 026 is missing', async () => {
    const { client } = recordingClient(() => MISSING_TABLE);
    expect(await promoteOrphanedPrimaries(client)).toEqual({ promoted: 0 });
  });
});

