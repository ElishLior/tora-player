import { describe, expect, it } from 'vitest';
import type { Category, CategoryWithChildren } from '@/types/database';
import { DAILY_CATEGORY_ID, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import {
  MAX_CATEGORY_LEVELS,
  buildCategoryTree,
  categoryAncestors,
  categoryDepth,
  categoryLabel,
  categoryLessonTotal,
  categoryOptions,
  categorySubtree,
  childrenOf,
  compareSiblings,
  containsProtectedCategory,
  descendantCategories,
  descendantIds,
  findCategory,
  hasEnglishName,
  isProtectedCategory,
  nextSortOrder,
  reorderSiblings,
  subtreeHeight,
  validMoveTargets,
  validateCategoryMove,
  validateCategoryParent,
} from './category-tree';

// Live ids (migration 005 + the top-level shorts category). Names as stored.
const LESSONS = '10000000-0000-0000-0000-000000000001'; // שיעורים
const WORK = '10000000-0000-0000-0000-000000000002'; // דרכי עבודה
const IMAGINATION = '10000000-0000-0000-0000-000000000003'; // כח המדמה
const SONG = '10000000-0000-0000-0000-000000000004'; // קצרים עם נעימות
const SHORTS = SHORTS_CATEGORY_ID; // קצרים
const ETZ = DAILY_CATEGORY_ID; // מתחילת עץ חיים (level 2, under שיעורים)
const TZION = '10000000-0000-0000-0000-000000000012'; // שיעורים בציון (level 2)
const ETZ_YEAR = '10000000-0000-0000-0000-000000000031'; // שנה א (level 3, under מתחילת עץ חיים)
const WORK_LESSONS = '10000000-0000-0000-0000-000000000021'; // שיעורים (under דרכי עבודה)
const WORK_QUALITY = '10000000-0000-0000-0000-000000000022'; // שיעורים באיכות גבוהה
const SHORTS_TOPIC = '10000000-0000-0000-0000-000000000051'; // נושא (under קצרים)
const SHORTS_DEEP = '10000000-0000-0000-0000-000000000061'; // תת נושא (level 3, under נושא)
const MISSING = '10000000-0000-0000-0000-0000000000ff';

function row(
  id: string,
  hebrew_name: string,
  sort_order: number,
  parent_id: string | null = null,
  name = '',
): Category {
  return {
    id,
    name,
    hebrew_name,
    description: null,
    icon: null,
    sort_order,
    parent_id,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };
}

const liveRows: Category[] = [
  row(LESSONS, 'שיעורים', 1),
  row(ETZ, 'מתחילת עץ חיים', 1, LESSONS),
  row(ETZ_YEAR, 'שנה א', 1, ETZ),
  row(TZION, 'שיעורים בציון', 2, LESSONS),
  row(WORK, 'דרכי עבודה', 2),
  row(WORK_LESSONS, 'שיעורים', 1, WORK),
  row(WORK_QUALITY, 'שיעורים באיכות גבוהה', 2, WORK),
  row(IMAGINATION, 'כח המדמה', 3),
  row(SONG, 'קצרים עם נעימות', 4),
  row(SHORTS, 'קצרים', 5),
  row(SHORTS_TOPIC, 'נושא', 1, SHORTS),
  row(SHORTS_DEEP, 'תת נושא', 1, SHORTS_TOPIC),
];

/** Built from reversed rows: the rules must not depend on input order. */
function liveTree(): CategoryWithChildren[] {
  return buildCategoryTree([...liveRows].reverse());
}

describe('buildCategoryTree', () => {
  it('nests up to three levels and sorts siblings by sort_order', () => {
    const tree = liveTree();
    expect(tree.map((c) => c.id)).toEqual([LESSONS, WORK, IMAGINATION, SONG, SHORTS]);
    const lessons = findCategory(tree, LESSONS);
    expect(lessons?.children.map((c) => c.id)).toEqual([ETZ, TZION]);
    expect(findCategory(tree, ETZ)?.children.map((c) => c.id)).toEqual([ETZ_YEAR]);
    expect(findCategory(tree, SHORTS_TOPIC)?.children.map((c) => c.id)).toEqual([SHORTS_DEEP]);
  });

  it('gives the same tree whatever order the rows arrive in', () => {
    const forward = buildCategoryTree(liveRows);
    const backward = buildCategoryTree([...liveRows].reverse());
    expect(JSON.stringify(forward)).toBe(JSON.stringify(backward));
  });

  it('breaks sort_order ties by hebrew_name, then by id', () => {
    const rows = [row('b', 'ב', 1), row('z', 'א', 1), row('a', 'א', 1), row('c', 'ג', 0)];
    expect(buildCategoryTree(rows).map((c) => c.id)).toEqual(['c', 'a', 'z', 'b']);
  });

  it('shows a row whose parent is not loaded at the top level, rather than hiding it', () => {
    const tree = buildCategoryTree([row('orphan', 'יתום', 1, MISSING)]);
    expect(tree.map((c) => c.id)).toEqual(['orphan']);
  });

  it('treats a row as its own parent as a top-level row', () => {
    expect(buildCategoryTree([row('self', 'עצמה', 1, 'self')]).map((c) => c.id)).toEqual(['self']);
  });

  it('drops a corrupt cycle instead of looping', () => {
    const tree = buildCategoryTree([row('x', 'x', 1, 'y'), row('y', 'y', 1, 'x')]);
    expect(tree).toEqual([]);
  });

  it('does not change the input rows', () => {
    const rows = [row(LESSONS, 'שיעורים', 1), row(ETZ, 'ילד', 1, LESSONS)];
    const snapshot = JSON.stringify(rows);
    buildCategoryTree(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe('compareSiblings', () => {
  it('orders by sort_order, then hebrew_name, then id', () => {
    expect(compareSiblings(row('a', 'ב', 1), row('b', 'א', 2))).toBeLessThan(0);
    expect(compareSiblings(row('a', 'א', 1), row('b', 'ב', 1))).toBeLessThan(0);
    expect(compareSiblings(row('a', 'א', 1), row('b', 'א', 1))).toBeLessThan(0);
    expect(compareSiblings(row('a', 'א', 1), row('a', 'א', 1))).toBe(0);
  });
});

describe('depth and height', () => {
  const tree = liveTree();

  it('measures depth 0, 1 and 2, and null for an unknown id', () => {
    expect(categoryDepth(tree, LESSONS)).toBe(0);
    expect(categoryDepth(tree, ETZ)).toBe(1);
    expect(categoryDepth(tree, ETZ_YEAR)).toBe(2);
    expect(categoryDepth(tree, MISSING)).toBeNull();
  });

  it('measures the levels below a node', () => {
    expect(subtreeHeight(findCategory(tree, ETZ_YEAR)!)).toBe(0);
    expect(subtreeHeight(findCategory(tree, WORK)!)).toBe(1);
    expect(subtreeHeight(findCategory(tree, ETZ)!)).toBe(1);
    expect(subtreeHeight(findCategory(tree, LESSONS)!)).toBe(2);
  });

  it('allows exactly three levels', () => {
    expect(MAX_CATEGORY_LEVELS).toBe(3);
  });
});

describe('ancestors, children and subtrees', () => {
  const tree = liveTree();

  it('lists ancestors from the top level down', () => {
    expect(categoryAncestors(tree, ETZ_YEAR).map((c) => c.id)).toEqual([LESSONS, ETZ]);
    expect(categoryAncestors(tree, ETZ).map((c) => c.id)).toEqual([LESSONS]);
    expect(categoryAncestors(tree, LESSONS)).toEqual([]);
    expect(categoryAncestors(tree, MISSING)).toEqual([]);
  });

  it("returns a category's direct children in sort order, at any level", () => {
    expect(childrenOf(tree, LESSONS).map((c) => c.id)).toEqual([ETZ, TZION]);
    expect(childrenOf(tree, ETZ).map((c) => c.id)).toEqual([ETZ_YEAR]);
    expect(childrenOf(tree, IMAGINATION)).toEqual([]);
    expect(childrenOf(tree, MISSING)).toEqual([]);
  });

  it('lists a branch as the category first, then its descendants depth-first', () => {
    expect(descendantIds(tree, LESSONS)).toEqual([LESSONS, ETZ, ETZ_YEAR, TZION]);
    expect(descendantIds(tree, ETZ)).toEqual([ETZ, ETZ_YEAR]);
    expect(descendantIds(tree, ETZ_YEAR)).toEqual([ETZ_YEAR]);
    expect(descendantIds(tree, MISSING)).toEqual([]);
    expect(descendantCategories(tree, SHORTS).map((c) => c.id)).toEqual([SHORTS, SHORTS_TOPIC, SHORTS_DEEP]);
  });

  it('returns one branch as a standalone tree, for a picker', () => {
    const branch = categorySubtree(tree, LESSONS);
    expect(branch.map((c) => c.id)).toEqual([LESSONS]);
    expect(branch[0].children.map((c) => c.id)).toEqual([ETZ, TZION]);
    expect(categorySubtree(tree, MISSING)).toEqual([]);
  });

  it('reads the branch total (subtree counts, each lesson once) and 0 for an unknown category', () => {
    const totals = { [LESSONS]: 15, [ETZ]: 6, [WORK]: 16 };
    expect(categoryLessonTotal(totals, LESSONS)).toBe(15);
    expect(categoryLessonTotal(totals, ETZ)).toBe(6);
    expect(categoryLessonTotal(totals, MISSING)).toBe(0);
  });
});

describe('protected categories', () => {
  it('protects the daily and shorts categories by id only', () => {
    expect(isProtectedCategory(DAILY_CATEGORY_ID)).toBe(true);
    expect(isProtectedCategory(SHORTS_CATEGORY_ID)).toBe(true);
    expect(isProtectedCategory(LESSONS)).toBe(false);
    expect(isProtectedCategory(TZION)).toBe(false);
  });

  it('marks every category whose branch holds a protected one, at any level', () => {
    const tree = liveTree();
    expect(containsProtectedCategory(tree, LESSONS)).toBe(true); // ETZ is the daily category, a child
    expect(containsProtectedCategory(tree, ETZ)).toBe(true);
    expect(containsProtectedCategory(tree, SHORTS)).toBe(true);
    expect(containsProtectedCategory(tree, WORK)).toBe(false);
    expect(containsProtectedCategory(tree, TZION)).toBe(false);
  });

  it('catches a protected sub-subcategory, which a delete of its grandparent would also remove', () => {
    const tree = buildCategoryTree([
      row(LESSONS, 'שיעורים', 1),
      row(TZION, 'אמצע', 1, LESSONS),
      row(DAILY_CATEGORY_ID, 'יומי', 1, TZION),
    ]);
    expect(containsProtectedCategory(tree, LESSONS)).toBe(true);
    expect(containsProtectedCategory(tree, TZION)).toBe(true);
  });
});

describe('labels', () => {
  it('shows the Hebrew name in Hebrew and the English name in English when there is one', () => {
    const cat = row(LESSONS, 'שיעורים', 1, null, 'Lessons');
    expect(categoryLabel(cat, 'he')).toBe('שיעורים');
    expect(categoryLabel(cat, 'en')).toBe('Lessons');
  });

  it('falls back to the Hebrew name in English when no English name is given', () => {
    expect(categoryLabel(row(LESSONS, 'שיעורים', 1, null, ''), 'en')).toBe('שיעורים');
  });

  it('treats a legacy English name that copies the Hebrew one as no English yet', () => {
    const legacy = row(LESSONS, 'שיעורים', 1, null, 'שיעורים');
    expect(hasEnglishName(legacy)).toBe(false);
    expect(categoryLabel(legacy, 'en')).toBe('שיעורים');
  });

  it('falls back to the English name when the Hebrew one is blank, so a label is never empty', () => {
    expect(categoryLabel(row(LESSONS, '', 1, null, 'Lessons'), 'he')).toBe('Lessons');
  });

  it('trims both names', () => {
    expect(categoryLabel(row(LESSONS, '  שיעורים ', 1, null, ' Lessons '), 'en')).toBe('Lessons');
  });

  it('labels every category, depth-first, with its parent for sub-subcategories', () => {
    const options = categoryOptions(liveTree());
    expect(options.map((o) => [o.label, o.depth])).toEqual([
      ['שיעורים', 0],
      ['מתחילת עץ חיים', 1],
      ['שנה א', 2],
      ['שיעורים בציון', 1],
      ['דרכי עבודה', 0],
      ['שיעורים', 1],
      ['שיעורים באיכות גבוהה', 1],
      ['כח המדמה', 0],
      ['קצרים עם נעימות', 0],
      ['קצרים', 0],
      ['נושא', 1],
      ['תת נושא', 2],
    ]);
  });

  it('names the parent of every option below the top level, and gives the parent id', () => {
    const options = categoryOptions(liveTree());
    expect(options.find((o) => o.id === ETZ_YEAR)).toMatchObject({ parentId: ETZ, parentLabel: 'מתחילת עץ חיים' });
    expect(options.find((o) => o.id === LESSONS)).toMatchObject({ parentId: null, parentLabel: null });
  });

  it('offers every category exactly once, so every one is selectable', () => {
    const ids = categoryOptions(liveTree()).map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(liveRows.length);
  });

  it('uses the locale for option labels', () => {
    const tree = buildCategoryTree([row(IMAGINATION, 'כח המדמה', 1, null, 'Imagination')]);
    expect(categoryOptions(tree, 'en')[0].label).toBe('Imagination');
    expect(categoryOptions(tree, 'he')[0].label).toBe('כח המדמה');
  });
});

describe('validateCategoryMove', () => {
  const tree = liveTree();
  const move = (id: string, newParentId: string | null) => validateCategoryMove({ tree, id, newParentId });

  it('allows a move to top level and under a top-level category', () => {
    expect(move(ETZ_YEAR, null)).toBeNull();
    expect(move(WORK_QUALITY, LESSONS)).toBeNull();
    expect(move(SHORTS_TOPIC, IMAGINATION)).toBeNull();
  });

  it('allows a move under a level-2 category when the branch stays within three levels', () => {
    expect(move(ETZ_YEAR, TZION)).toBeNull();
    expect(move(ETZ_YEAR, WORK_LESSONS)).toBeNull();
    expect(move(ETZ, WORK)).toBeNull();
  });

  it('treats a move to the current parent as allowed (a no-op)', () => {
    expect(move(ETZ_YEAR, ETZ)).toBeNull();
    expect(move(WORK, null)).toBeNull();
  });

  it('measures depth on the deepest descendant of the moved branch', () => {
    // WORK has one level below it: under a level-2 parent it would reach level 4.
    expect(move(WORK, TZION)).toBe('too-deep');
    expect(move(WORK, SHORTS_TOPIC)).toBe('too-deep');
    // SHORTS has two levels below it: under any top-level parent it would reach level 4.
    expect(move(SHORTS, WORK)).toBe('too-deep');
    // LESSONS has two levels below it: it can only stay at top level.
    expect(move(LESSONS, WORK)).toBe('too-deep');
    // ...and a level-2 category with a level below it cannot go under a level-2 parent.
    expect(move(SHORTS_TOPIC, ETZ)).toBe('too-deep');
  });

  it('rejects a leaf that would land at level 4', () => {
    expect(move(ETZ_YEAR, SHORTS_DEEP)).toBe('too-deep');
    expect(move(TZION, ETZ_YEAR)).toBe('too-deep');
  });

  it('rejects a category as its own parent', () => {
    expect(move(ETZ_YEAR, ETZ_YEAR)).toBe('self');
    expect(move(LESSONS, LESSONS)).toBe('self');
  });

  it('rejects moving a category under its own descendant (a cycle)', () => {
    expect(move(LESSONS, ETZ)).toBe('cycle');
    expect(move(LESSONS, ETZ_YEAR)).toBe('cycle');
    expect(move(ETZ, ETZ_YEAR)).toBe('cycle');
  });

  it('reports a cycle before a depth error when both apply', () => {
    expect(move(LESSONS, ETZ_YEAR)).toBe('cycle');
  });

  it('rejects an unknown parent and an unknown category', () => {
    expect(move(ETZ_YEAR, MISSING)).toBe('missing-parent');
    expect(move(MISSING, LESSONS)).toBe('missing-category');
  });
});

describe('validateCategoryParent', () => {
  const tree = liveTree();

  it('allows a new category at top level or under a category of level 1 or 2', () => {
    expect(validateCategoryParent({ tree, parentId: null })).toBeNull();
    expect(validateCategoryParent({ tree, parentId: '' })).toBeNull();
    expect(validateCategoryParent({ tree, parentId: LESSONS })).toBeNull();
    expect(validateCategoryParent({ tree, parentId: ETZ })).toBeNull();
  });

  it('refuses a new category under a level-3 category, which would be level 4', () => {
    expect(validateCategoryParent({ tree, parentId: ETZ_YEAR })).toBe('too-deep');
    expect(validateCategoryParent({ tree, parentId: SHORTS_DEEP })).toBe('too-deep');
  });

  it('refuses an unknown parent', () => {
    expect(validateCategoryParent({ tree, parentId: MISSING })).toBe('missing-parent');
  });

  it('checks a move when the category already exists', () => {
    expect(validateCategoryParent({ tree, id: LESSONS, parentId: ETZ })).toBe('cycle');
    expect(validateCategoryParent({ tree, id: WORK, parentId: TZION })).toBe('too-deep');
    expect(validateCategoryParent({ tree, id: ETZ_YEAR, parentId: WORK })).toBeNull();
  });
});

describe('validMoveTargets', () => {
  const tree = liveTree();

  it('offers top level and every category that keeps the branch within three levels', () => {
    const targets = validMoveTargets(tree, ETZ_YEAR).map((t) => t.parentId);
    // Not its current parent (ETZ), not level-3 categories, not itself.
    expect(targets).toEqual([
      null,
      LESSONS,
      TZION,
      WORK,
      WORK_LESSONS,
      WORK_QUALITY,
      IMAGINATION,
      SONG,
      SHORTS,
      SHORTS_TOPIC,
    ]);
  });

  it('gives each target the depth the moved category would have there', () => {
    const targets = validMoveTargets(tree, ETZ_YEAR);
    expect(targets.find((t) => t.parentId === null)?.depth).toBe(0);
    expect(targets.find((t) => t.parentId === WORK)?.depth).toBe(1);
    expect(targets.find((t) => t.parentId === WORK_LESSONS)?.depth).toBe(2);
    expect(targets.find((t) => t.parentId === WORK)?.label).toBe('דרכי עבודה');
  });

  it('offers nothing for a branch that already fills three levels', () => {
    expect(validMoveTargets(tree, LESSONS)).toEqual([]);
  });

  it('leaves out top level for a category that is already top level', () => {
    expect(validMoveTargets(tree, WORK).some((t) => t.parentId === null)).toBe(false);
  });

  it('is empty for an unknown category', () => {
    expect(validMoveTargets(tree, MISSING)).toEqual([]);
  });
});

describe('nextSortOrder', () => {
  const tree = liveTree();

  it('puts a new top-level category after the highest top-level sort_order', () => {
    expect(nextSortOrder(tree, null)).toBe(6);
  });

  it('puts a new child after the highest sibling sort_order, at any level', () => {
    expect(nextSortOrder(tree, LESSONS)).toBe(3);
    expect(nextSortOrder(tree, WORK)).toBe(3);
    expect(nextSortOrder(tree, ETZ)).toBe(2);
  });

  it('starts at 0 for a category with no children, or an unknown parent', () => {
    expect(nextSortOrder(tree, IMAGINATION)).toBe(0);
    expect(nextSortOrder(tree, MISSING)).toBe(0);
    expect(nextSortOrder([], null)).toBe(0);
  });
});

describe('reorderSiblings', () => {
  const tree = buildCategoryTree([row('a', 'א', 0), row('b', 'ב', 1), row('c', 'ג', 2)]);

  it('moves a category to a new index among its siblings and renumbers them 0..n-1', () => {
    expect(reorderSiblings({ tree, id: 'a', newIndex: 2 })).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'c', sort_order: 1 },
      { id: 'a', sort_order: 2 },
    ]);
    expect(reorderSiblings({ tree, id: 'c', newIndex: 0 })).toEqual([
      { id: 'c', sort_order: 0 },
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
  });

  it('keeps the order when the index does not change', () => {
    expect(reorderSiblings({ tree, id: 'b', newIndex: 1 })).toEqual([
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ]);
  });

  it('clamps an index past the end or below zero', () => {
    expect(reorderSiblings({ tree, id: 'a', newIndex: 99 })?.at(-1)).toEqual({ id: 'a', sort_order: 2 });
    expect(reorderSiblings({ tree, id: 'c', newIndex: -4 })?.[0]).toEqual({ id: 'c', sort_order: 0 });
  });

  it('works among the children of a subcategory, without touching other branches', () => {
    const live = liveTree();
    expect(reorderSiblings({ tree: live, id: WORK_QUALITY, newIndex: 0 })).toEqual([
      { id: WORK_QUALITY, sort_order: 0 },
      { id: WORK_LESSONS, sort_order: 1 },
    ]);
  });

  it('returns null for an unknown category or a non-finite index', () => {
    expect(reorderSiblings({ tree, id: MISSING, newIndex: 0 })).toBeNull();
    expect(reorderSiblings({ tree, id: 'a', newIndex: Number.NaN })).toBeNull();
  });
});

describe('categorySubtree of an unknown id', () => {
  it('is empty', () => {
    expect(categorySubtree(liveTree(), MISSING)).toEqual([]);
  });
});
