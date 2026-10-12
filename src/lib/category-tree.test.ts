import { describe, expect, it } from 'vitest';
import type { Category, CategoryWithChildren } from '@/types/database';
import { DAILY_CATEGORY_ID, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import {
  categoryOptions,
  categorySubtree,
  childrenOf,
  containsProtectedCategory,
  findCategory,
  isProtectedCategory,
  nextSortOrder,
  validateCategoryParent,
} from './category-tree';

// Live tree (migration 005 + the top-level shorts category). Ids and names as stored.
const LESSONS = '10000000-0000-0000-0000-000000000001'; // שיעורים
const WORK = '10000000-0000-0000-0000-000000000002'; // דרכי עבודה
const IMAGINATION = '10000000-0000-0000-0000-000000000003'; // כח המדמה
const SONG_SHORTS = '10000000-0000-0000-0000-000000000004'; // קצרים עם נעימות
const SHORTS = '10000000-0000-0000-0000-000000000005'; // קצרים
const ETZ_CHAIM = '10000000-0000-0000-0000-000000000011'; // מתחילת עץ חיים (the daily category)
const TZION = '10000000-0000-0000-0000-000000000012'; // שיעורים בציון
const WORK_LESSONS = '10000000-0000-0000-0000-000000000021'; // שיעורים (under דרכי עבודה)
const WORK_QUALITY = '10000000-0000-0000-0000-000000000022'; // שיעורים באיכות גבוהה

function cat(id: string, hebrew_name: string, sort_order: number, parent_id: string | null = null): Category {
  return {
    id,
    name: '',
    hebrew_name,
    description: null,
    icon: null,
    sort_order,
    parent_id,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };
}

function withChildren(parent: Category, children: Category[]): CategoryWithChildren {
  return { ...parent, children };
}

/** Built in a deliberately shuffled order: the rules must not depend on input order. */
function liveTree(): CategoryWithChildren[] {
  return [
    withChildren(cat(SHORTS, 'קצרים', 5), []),
    withChildren(cat(LESSONS, 'שיעורים', 1), [
      cat(TZION, 'שיעורים בציון בניהו בן יהוידע', 2, LESSONS),
      cat(ETZ_CHAIM, 'מתחילת עץ חיים', 1, LESSONS),
    ]),
    withChildren(cat(IMAGINATION, 'כח המדמה', 3), []),
    withChildren(cat(WORK, 'דרכי עבודה', 2), [
      cat(WORK_QUALITY, 'שיעורים באיכות גבוהה', 2, WORK),
      cat(WORK_LESSONS, 'שיעורים', 1, WORK),
    ]),
    withChildren(cat(SONG_SHORTS, 'קצרים עם נעימות', 4), []),
  ];
}

describe('categoryOptions', () => {
  it('lists each top-level category followed by its children, in sort order', () => {
    const options = categoryOptions(liveTree());
    expect(options.map((o) => [o.label, o.depth])).toEqual([
      ['שיעורים', 0],
      ['מתחילת עץ חיים', 1],
      ['שיעורים בציון בניהו בן יהוידע', 1],
      ['דרכי עבודה', 0],
      ['שיעורים', 1],
      ['שיעורים באיכות גבוהה', 1],
      ['כח המדמה', 0],
      ['קצרים עם נעימות', 0],
      ['קצרים', 0],
    ]);
  });

  it('gives children their parent id and top-level options no parent', () => {
    const options = categoryOptions(liveTree());
    expect(options.find((o) => o.id === ETZ_CHAIM)?.parentId).toBe(LESSONS);
    expect(options.find((o) => o.id === LESSONS)?.parentId).toBeNull();
  });

  it('offers every category exactly once, so every one is selectable', () => {
    const ids = categoryOptions(liveTree()).map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(9);
  });

  it('labels with the Hebrew name and falls back to the English name', () => {
    const tree = [withChildren({ ...cat(IMAGINATION, '', 1), name: 'Imagination' }, [])];
    expect(categoryOptions(tree)[0].label).toBe('Imagination');
  });
});

describe('validateCategoryParent', () => {
  const tree = liveTree();

  it('allows a top-level category, even one that has children', () => {
    expect(validateCategoryParent({ tree, id: LESSONS, parentId: null })).toBeNull();
    expect(validateCategoryParent({ tree, id: LESSONS, parentId: undefined })).toBeNull();
    expect(validateCategoryParent({ tree, parentId: '' })).toBeNull();
  });

  it('allows a new category under a top-level parent', () => {
    expect(validateCategoryParent({ tree, parentId: WORK })).toBeNull();
  });

  it('allows a top-level leaf to move under another top-level category', () => {
    expect(validateCategoryParent({ tree, id: IMAGINATION, parentId: LESSONS })).toBeNull();
  });

  it('allows a child to move to another top-level parent', () => {
    expect(validateCategoryParent({ tree, id: ETZ_CHAIM, parentId: IMAGINATION })).toBeNull();
    expect(validateCategoryParent({ tree, id: ETZ_CHAIM, parentId: LESSONS })).toBeNull();
  });

  it('rejects a category as its own parent', () => {
    expect(validateCategoryParent({ tree, id: IMAGINATION, parentId: IMAGINATION })).toBe('self');
    expect(validateCategoryParent({ tree, id: ETZ_CHAIM, parentId: ETZ_CHAIM })).toBe('self');
  });

  it('rejects an unknown parent', () => {
    expect(validateCategoryParent({ tree, parentId: '10000000-0000-0000-0000-0000000000ff' })).toBe('missing-parent');
  });

  it('rejects a child as parent, which would create a third level', () => {
    expect(validateCategoryParent({ tree, parentId: ETZ_CHAIM })).toBe('too-deep');
    expect(validateCategoryParent({ tree, id: IMAGINATION, parentId: WORK_LESSONS })).toBe('too-deep');
  });

  it('rejects a category with children that is given a parent', () => {
    expect(validateCategoryParent({ tree, id: LESSONS, parentId: IMAGINATION })).toBe('has-children');
    expect(validateCategoryParent({ tree, id: WORK, parentId: SHORTS })).toBe('has-children');
  });

  it('reports too-deep before has-children when both apply', () => {
    expect(validateCategoryParent({ tree, id: WORK, parentId: ETZ_CHAIM })).toBe('too-deep');
  });
});

describe('protected categories', () => {
  const tree = liveTree();

  it('protects the daily and shorts categories by id only', () => {
    expect(isProtectedCategory(DAILY_CATEGORY_ID)).toBe(true);
    expect(isProtectedCategory(SHORTS_CATEGORY_ID)).toBe(true);
    expect(isProtectedCategory(LESSONS)).toBe(false);
    expect(isProtectedCategory(TZION)).toBe(false);
  });

  it('marks a parent whose child is the daily category, so deleting the parent is refused', () => {
    expect(containsProtectedCategory(tree, LESSONS)).toBe(true);
    expect(containsProtectedCategory(tree, ETZ_CHAIM)).toBe(true);
  });

  it('marks shorts itself and not unrelated categories', () => {
    expect(containsProtectedCategory(tree, SHORTS)).toBe(true);
    expect(containsProtectedCategory(tree, WORK)).toBe(false);
    expect(containsProtectedCategory(tree, TZION)).toBe(false);
  });
});

describe('nextSortOrder', () => {
  const tree = liveTree();

  it('puts a new top-level category after the highest top-level sort_order', () => {
    expect(nextSortOrder(tree, null)).toBe(6);
  });

  it('puts a new child after the highest sibling sort_order', () => {
    expect(nextSortOrder(tree, LESSONS)).toBe(3);
    expect(nextSortOrder(tree, WORK)).toBe(3);
  });

  it('starts at 0 for a parent with no children, or an unknown parent', () => {
    expect(nextSortOrder(tree, IMAGINATION)).toBe(0);
    expect(nextSortOrder(tree, '10000000-0000-0000-0000-0000000000ff')).toBe(0);
    expect(nextSortOrder([], null)).toBe(0);
  });
});

describe('tree lookups', () => {
  const tree = liveTree();

  it('finds top-level and child categories by id', () => {
    expect(findCategory(tree, WORK)?.hebrew_name).toBe('דרכי עבודה');
    expect(findCategory(tree, WORK_LESSONS)?.parent_id).toBe(WORK);
    expect(findCategory(tree, '10000000-0000-0000-0000-0000000000ff')).toBeUndefined();
  });

  it("returns a parent's children in sort order", () => {
    expect(childrenOf(tree, LESSONS).map((c) => c.id)).toEqual([ETZ_CHAIM, TZION]);
    expect(childrenOf(tree, IMAGINATION)).toEqual([]);
  });

  it('returns one branch for the shorts picker, whether the id is top-level or a child', () => {
    const shorts = categorySubtree(tree, SHORTS);
    expect(shorts.map((c) => c.id)).toEqual([SHORTS]);
    expect(shorts[0].children).toEqual([]);

    const daily = categorySubtree(tree, ETZ_CHAIM);
    expect(daily.map((c) => c.id)).toEqual([ETZ_CHAIM]);
    expect(categorySubtree(tree, '10000000-0000-0000-0000-0000000000ff')).toEqual([]);
  });
});
