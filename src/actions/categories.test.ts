import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '@/types/database';
import { DAILY_CATEGORY_ID, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';

vi.mock('@/lib/auth/admin', () => ({ isAdmin: vi.fn(async () => true) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ requireServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/supabase/anon', () => ({ revalidateCatalog: vi.fn() }));

import { isAdmin } from '@/lib/auth/admin';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { revalidateCatalog } from '@/lib/supabase/anon';
import { createCategory, deleteCategory, moveCategory, reorderCategory, updateCategory } from './categories';

type DbError = { code?: string; message?: string } | null;

interface Write {
  id: string | undefined;
  changes: Record<string, unknown>;
}

interface Call {
  name: string;
  args: Record<string, unknown>;
}

const LESSONS = '10000000-0000-0000-0000-000000000001';
const ETZ = DAILY_CATEGORY_ID;
const ETZ_YEAR = '10000000-0000-0000-0000-000000000031';
const WORK = '10000000-0000-0000-0000-000000000002';
const WORK_LESSONS = '10000000-0000-0000-0000-000000000021';
const WORK_QUALITY = '10000000-0000-0000-0000-000000000022';
const UPDATED = '2026-10-01T10:00:00+00:00';

function row(
  id: string,
  hebrew_name: string,
  sort_order: number,
  parent_id: string | null = null,
  extra: Partial<Category> = {},
): Category {
  return {
    id,
    name: '',
    hebrew_name,
    description: null,
    icon: null,
    sort_order,
    parent_id,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: UPDATED,
    ...extra,
  };
}

/** Live-like rows: שיעורים → מתחילת עץ חיים → שנה א (level 3); דרכי עבודה → two children. */
function rows(): Category[] {
  return [
    row(LESSONS, 'שיעורים', 1),
    row(ETZ, 'מתחילת עץ חיים', 1, LESSONS),
    row(ETZ_YEAR, 'שנה א', 1, ETZ),
    row(WORK, 'דרכי עבודה', 2),
    row(WORK_LESSONS, 'שיעורים', 1, WORK),
    row(WORK_QUALITY, 'שיעורים באיכות גבוהה', 2, WORK),
  ];
}

/**
 * A fake admin client. `categories` answers reads and records writes; `rpc`
 * answers each RPC with an error (or null). Calls are recorded for assertions.
 */
function fakeAdmin(categories: Category[], rpc: (name: string, args: Record<string, unknown>) => DbError = () => null) {
  const writes: Write[] = [];
  const inserts: Record<string, unknown>[] = [];
  const calls: Call[] = [];

  const client = {
    from(table: string) {
      if (table !== 'categories') throw new Error(`unexpected table ${table}`);
      let op:
        | { kind: 'select' }
        | { kind: 'update'; changes: Record<string, unknown> }
        | { kind: 'insert'; payload: Record<string, unknown> } = {
        kind: 'select',
      };
      let filterId: string | undefined;
      let filterUpdatedAt: string | undefined;
      const builder = {
        select: () => builder,
        order: () => builder,
        single: () => builder,
        maybeSingle: () => builder,
        update: (changes: Record<string, unknown>) => {
          op = { kind: 'update', changes };
          return builder;
        },
        insert: (payload: Record<string, unknown>) => {
          op = { kind: 'insert', payload };
          return builder;
        },
        eq: (column: string, value: unknown) => {
          if (column === 'id') filterId = String(value);
          if (column === 'updated_at') filterUpdatedAt = String(value);
          return builder;
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          let result: { data: unknown; error: DbError };
          if (op.kind === 'update') {
            // Like PostgREST: the update matches no row when the version filter differs.
            const current = categories.find((c) => c.id === filterId);
            const matches = current !== undefined && (filterUpdatedAt === undefined || current.updated_at === filterUpdatedAt);
            if (matches) {
              writes.push({ id: filterId, changes: op.changes });
              result = { data: { ...current, ...op.changes }, error: null };
            } else {
              result = { data: null, error: null };
            }
          } else if (op.kind === 'insert') {
            inserts.push(op.payload);
            result = { data: { id: 'new-id', ...op.payload }, error: null };
          } else {
            result = { data: categories, error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: null, error: rpc(name, args) });
    },
  };

  return { client, writes, inserts, calls };
}

function useAdmin(fake: ReturnType<typeof fakeAdmin>) {
  vi.mocked(createAdminSupabaseClient).mockReturnValue(fake.client as never);
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAdmin).mockResolvedValue(true);
});

describe('moveCategory', () => {
  it('refuses a non-admin before reading or writing anything', async () => {
    vi.mocked(isAdmin).mockResolvedValueOnce(false);
    expect(await moveCategory(ETZ_YEAR, WORK, 0, UPDATED)).toEqual({ error: 'not-admin' });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it('moves through move_category with the expected updated_at, then revalidates the catalog', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    expect(await moveCategory(ETZ_YEAR, WORK, 2, UPDATED)).toEqual({ success: true });
    expect(fake.calls).toEqual([
      {
        name: 'move_category',
        args: { p_id: ETZ_YEAR, p_new_parent: WORK, p_new_index: 2, p_expected_updated_at: UPDATED },
      },
    ]);
    expect(revalidateCatalog).toHaveBeenCalledTimes(1);
  });

  it('reports a stale category (CAT01) as stale, and does not revalidate', async () => {
    const fake = fakeAdmin(rows(), () => ({ code: 'CAT01', message: 'category changed by someone else' }));
    useAdmin(fake);

    expect(await moveCategory(ETZ_YEAR, WORK, 0, '2026-09-01T00:00:00+00:00')).toEqual({ error: 'stale' });
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });

  it.each([
    ['CAT02', 'missing-category'],
    ['CAT03', 'self'],
    ['CAT04', 'cycle'],
    ['CAT05', 'too-deep'],
    ['CAT06', 'missing-parent'],
  ])('maps the database error %s to %s', async (code, expected) => {
    useAdmin(fakeAdmin(rows(), () => ({ code, message: 'x' })));
    expect(await moveCategory(ETZ_YEAR, WORK, 0, UPDATED)).toEqual({ error: expected });
  });

  it.each([
    ['undefined_function (42883)', { code: '42883', message: 'function public.move_category does not exist' }],
    ['PostgREST missing function (PGRST202)', { code: 'PGRST202', message: 'Could not find the function' }],
  ])('asks for migration 023 when the function is missing: %s', async (_label, error) => {
    useAdmin(fakeAdmin(rows(), () => error));
    expect(await moveCategory(ETZ_YEAR, WORK, 0, UPDATED)).toEqual({ error: 'migration-missing' });
  });

  it('checks the rules on the current tree first, so an invalid move never reaches the database function', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    // Moving שיעורים (two levels below it) under דרכי עבודה would reach level 4.
    expect(await moveCategory(LESSONS, WORK, 0, UPDATED)).toEqual({ error: 'too-deep' });
    expect(await moveCategory(LESSONS, ETZ_YEAR, 0, UPDATED)).toEqual({ error: 'cycle' });
    expect(fake.calls).toEqual([]);
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });

  it('reports an unknown category without calling the database function', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);
    expect(await moveCategory('10000000-0000-0000-0000-0000000000ff', null, 0, UPDATED)).toEqual({
      error: 'missing-category',
    });
    expect(fake.calls).toEqual([]);
  });

  it('maps any other database failure to failed', async () => {
    useAdmin(fakeAdmin(rows(), () => ({ code: 'XX000', message: 'boom' })));
    expect(await moveCategory(ETZ_YEAR, WORK, 0, UPDATED)).toEqual({ error: 'failed' });
  });
});

describe('reorderCategory', () => {
  it('uses reorder_category when it exists', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    expect(await reorderCategory(WORK_QUALITY, 0, UPDATED)).toEqual({ success: true });
    expect(fake.calls).toEqual([
      { name: 'reorder_category', args: { p_id: WORK_QUALITY, p_new_index: 0, p_expected_updated_at: UPDATED } },
    ]);
    expect(fake.writes).toEqual([]);
    expect(revalidateCatalog).toHaveBeenCalledTimes(1);
  });

  it('reports a stale category from reorder_category as stale', async () => {
    useAdmin(fakeAdmin(rows(), () => ({ code: 'CAT01', message: 'changed' })));
    expect(await reorderCategory(WORK_QUALITY, 0, '2026-09-01T00:00:00+00:00')).toEqual({ error: 'stale' });
  });

  describe('without migration 023', () => {
    const missing = () => ({ code: 'PGRST202', message: 'Could not find the function' });

    it('refuses to reorder a category changed since it was read, and writes nothing', async () => {
      const fake = fakeAdmin(rows(), missing);
      useAdmin(fake);

      expect(await reorderCategory(WORK_QUALITY, 0, '2026-09-01T00:00:00+00:00')).toEqual({ error: 'stale' });
      expect(fake.writes).toEqual([]);
      expect(revalidateCatalog).not.toHaveBeenCalled();
    });

    it('renumbers the siblings 0..n-1 and writes only the rows whose sort_order changes', async () => {
      const fake = fakeAdmin(rows(), missing);
      useAdmin(fake);

      expect(await reorderCategory(WORK_QUALITY, 0, UPDATED)).toEqual({ success: true });
      // WORK_QUALITY moves to position 0 (sort 2 becomes 0). WORK_LESSONS stays at position 1 (sort 1), so it is not written.
      expect(fake.writes).toEqual([{ id: WORK_QUALITY, changes: { sort_order: 0 } }]);
      expect(revalidateCatalog).toHaveBeenCalledTimes(1);
    });

    it('writes nothing when every sibling already holds its position', async () => {
      const compact = [
        row(WORK, 'דרכי עבודה', 0),
        row(WORK_LESSONS, 'שיעורים', 0, WORK),
        row(WORK_QUALITY, 'שיעורים באיכות גבוהה', 1, WORK),
      ];
      const fake = fakeAdmin(compact, missing);
      useAdmin(fake);

      expect(await reorderCategory(WORK_LESSONS, 0, UPDATED)).toEqual({ success: true });
      expect(fake.writes).toEqual([]);
      expect(revalidateCatalog).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createCategory', () => {
  it('stores a blank English name as an empty string, not the Hebrew name', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    const result = await createCategory(form({ hebrew_name: 'חדש', name: '', parent_id: '' }));
    expect('data' in result).toBe(true);
    expect(fake.inserts[0]).toMatchObject({ hebrew_name: 'חדש', name: '', parent_id: null, sort_order: 3 });
  });

  it('keeps an English name that was given', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    await createCategory(form({ hebrew_name: 'חדש', name: 'New', parent_id: WORK }));
    expect(fake.inserts[0]).toMatchObject({ name: 'New', parent_id: WORK, sort_order: 3 });
  });

  it('allows a sub-subcategory: a parent at level 2 gets a child at level 3', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    const result = await createCategory(form({ hebrew_name: 'שנה ב', parent_id: ETZ }));
    expect('data' in result).toBe(true);
    // ETZ already has ETZ_YEAR (sort 1), so the new one goes after it.
    expect(fake.inserts[0]).toMatchObject({ parent_id: ETZ, sort_order: 2 });
  });

  it('refuses a fourth level: a parent already at level 3', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    expect(await createCategory(form({ hebrew_name: 'חדש', parent_id: ETZ_YEAR }))).toEqual({
      error: { parent_id: ['אפשר שלוש רמות לכל היותר: אי אפשר להוסיף תת-קטגוריה מתחת לתת-קטגוריה'] },
    });
    expect(fake.inserts).toEqual([]);
  });
});

describe('updateCategory', () => {
  it('changes only the Hebrew name when only that was sent, leaving the English name alone', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    await updateCategory(WORK, form({ hebrew_name: 'עבודה' }), UPDATED);
    expect(fake.writes).toEqual([{ id: WORK, changes: { hebrew_name: 'עבודה' } }]);
  });

  it('clears the English name when it is sent blank, and never copies the Hebrew one into it', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    await updateCategory(WORK, form({ hebrew_name: 'דרכי עבודה', name: '' }), UPDATED);
    expect(fake.writes).toEqual([{ id: WORK, changes: { hebrew_name: 'דרכי עבודה', name: '' } }]);
  });

  it('refuses a parent change here: moveCategory does that atomically', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    const result = await updateCategory(ETZ_YEAR, form({ hebrew_name: 'שנה א', parent_id: WORK }), UPDATED);
    expect('error' in result && typeof result.error === 'object' && result.error.parent_id).toEqual([
      'כדי להעביר קטגוריה לאב אחר, השתמשו באפשרות "העברה אל…"',
    ]);
    expect(fake.writes).toEqual([]);
  });

  it('accepts a parent value that matches the current parent', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    const result = await updateCategory(ETZ_YEAR, form({ hebrew_name: 'שנה א', parent_id: ETZ }), UPDATED);
    expect('data' in result).toBe(true);
  });

  it('writes only the version the admin read, and refuses a save over a newer one with stale', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    const result = await updateCategory(WORK, form({ hebrew_name: 'עבודה' }), '2026-09-01T10:00:00+00:00');

    expect(result).toEqual({ error: 'stale' });
    expect(fake.writes).toEqual([]);
  });

  it('returns the saved row when the version matches', async () => {
    const fake = fakeAdmin(rows());
    useAdmin(fake);

    const result = await updateCategory(WORK, form({ hebrew_name: 'עבודה' }), UPDATED);

    expect(result).toMatchObject({ data: { id: WORK, hebrew_name: 'עבודה' } });
    expect(fake.writes).toHaveLength(1);
  });
});

describe('deleteCategory', () => {
  it('refuses to delete a category whose sub-subcategory is protected, since the delete cascades', async () => {
    const withProtectedDeep = [
      row(LESSONS, 'שיעורים', 1),
      row(WORK, 'אמצע', 1, LESSONS),
      row(DAILY_CATEGORY_ID, 'יומי', 1, WORK),
    ];
    const fake = fakeAdmin(withProtectedDeep);
    useAdmin(fake);

    expect(await deleteCategory(LESSONS)).toEqual({
      error: 'קטגוריה זו, או תת-קטגוריה שלה, משמשת את העלאת השיעורים ולא ניתן למחוק אותה',
    });
  });

  it('refuses to delete the shorts category itself', async () => {
    const fake = fakeAdmin([row(SHORTS_CATEGORY_ID, 'קצרים', 1)]);
    useAdmin(fake);
    expect('error' in (await deleteCategory(SHORTS_CATEGORY_ID))).toBe(true);
  });
});
