import { describe, expect, it } from 'vitest';
import { buildCategoryTree } from '@/lib/category-tree';
import type { Category } from '@/types/database';
import {
  categoryPickerRows,
  lessonsLeftWithoutCategory,
  makePrimaryCategory,
  normalizeCategorySelection,
  primaryCategoryId,
  sameCategorySelection,
  toggleCategory,
} from './lesson-categories';

const LESSONS = '20000000-0000-0000-0000-000000000001';
const ETZ = '20000000-0000-0000-0000-000000000002';
const ETZ_YEAR = '20000000-0000-0000-0000-000000000003';
const WORK = '20000000-0000-0000-0000-000000000004';
const WORK_QUALITY = '20000000-0000-0000-0000-000000000005';
const UNKNOWN = '20000000-0000-0000-0000-0000000000ff';

function row(id: string, hebrew_name: string, sort_order: number, parent_id: string | null = null): Category {
  return {
    id,
    name: '',
    hebrew_name,
    description: null,
    icon: null,
    sort_order,
    parent_id,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/** שיעורים → מתחילת עץ חיים → שנה א (3 levels); דרכי עבודה → איכות (2 levels). */
function tree() {
  return buildCategoryTree([
    row(LESSONS, 'שיעורים', 1),
    row(ETZ, 'עץ חיים', 1, LESSONS),
    row(ETZ_YEAR, 'שנה א', 1, ETZ),
    row(WORK, 'דרכי עבודה', 2),
    row(WORK_QUALITY, 'איכות', 1, WORK),
  ]);
}

describe('normalizeCategorySelection', () => {
  it('keeps the order, drops duplicates and unknown ids, at any level', () => {
    expect(normalizeCategorySelection([ETZ_YEAR, UNKNOWN, WORK, ETZ_YEAR, LESSONS], tree())).toEqual([
      ETZ_YEAR,
      WORK,
      LESSONS,
    ]);
  });

  it('returns an empty selection when nothing known is left', () => {
    expect(normalizeCategorySelection([UNKNOWN], tree())).toEqual([]);
    expect(normalizeCategorySelection([], tree())).toEqual([]);
  });
});

describe('primaryCategoryId', () => {
  it('is the first id of the selection, or null', () => {
    expect(primaryCategoryId([ETZ, WORK])).toBe(ETZ);
    expect(primaryCategoryId([])).toBeNull();
  });
});

describe('toggleCategory and makePrimaryCategory', () => {
  it('appends a ticked category and keeps the primary first', () => {
    expect(toggleCategory([ETZ], WORK)).toEqual([ETZ, WORK]);
  });

  it('unticks a category without changing the others', () => {
    expect(toggleCategory([ETZ, WORK], ETZ)).toEqual([WORK]);
  });

  it('moves a selected category to the front to make it primary', () => {
    expect(makePrimaryCategory([ETZ, WORK, LESSONS], LESSONS)).toEqual([LESSONS, ETZ, WORK]);
  });

  it('leaves the selection alone when the id is not selected', () => {
    expect(makePrimaryCategory([ETZ], WORK)).toEqual([ETZ]);
  });
});

describe('sameCategorySelection', () => {
  it('compares order as well as members', () => {
    expect(sameCategorySelection([ETZ, WORK], [ETZ, WORK])).toBe(true);
    expect(sameCategorySelection([ETZ, WORK], [WORK, ETZ])).toBe(false);
    expect(sameCategorySelection([ETZ], [ETZ, WORK])).toBe(false);
  });
});

describe('categoryPickerRows', () => {
  it('lists every category in tree order with its depth and parent label', () => {
    const rows = categoryPickerRows(tree(), 'he');
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      [LESSONS, 0],
      [ETZ, 1],
      [ETZ_YEAR, 2],
      [WORK, 0],
      [WORK_QUALITY, 1],
    ]);
    expect(rows[2].parentLabel).toBe('עץ חיים');
  });

  it('keeps a match with its ancestors and its branch', () => {
    const ids = categoryPickerRows(tree(), 'he', 'שנה').map((r) => r.id);
    expect(ids).toEqual([LESSONS, ETZ, ETZ_YEAR]);
  });

  it('shows the children of a matching parent', () => {
    const ids = categoryPickerRows(tree(), 'he', 'דרכי').map((r) => r.id);
    expect(ids).toEqual([WORK, WORK_QUALITY]);
  });

  it('returns nothing for a query with no match', () => {
    expect(categoryPickerRows(tree(), 'he', 'לא קיים')).toEqual([]);
  });
});

describe('lessonsLeftWithoutCategory', () => {
  it('counts a lesson only when every one of its categories is in the deleted branch', () => {
    const lessons = [
      { categoryIds: [ETZ] }, // only in the branch: lost
      { categoryIds: [ETZ, WORK] }, // WORK survives: kept
      { categoryIds: [ETZ_YEAR, ETZ] }, // whole branch: lost
    ];
    expect(lessonsLeftWithoutCategory(lessons, [ETZ, ETZ_YEAR])).toBe(2);
  });

  it('counts nothing when no lesson sits only in the branch', () => {
    expect(lessonsLeftWithoutCategory([{ categoryIds: [ETZ, WORK] }], [ETZ])).toBe(0);
    expect(lessonsLeftWithoutCategory([], [ETZ])).toBe(0);
  });
});

