/**
 * Pure rules for the category tree. Categories have up to three levels:
 * category → subcategory → sub-subcategory (MAX_CATEGORY_LEVELS). Shared by
 * the admin page, the category actions, <CategoryPicker>, the public category
 * pages and the lesson filters, so the rules live in one place.
 *
 * Sibling order is deterministic: sort_order, then hebrew_name, then id, all
 * compared by code unit (the same order as SQL `COLLATE "C"`). Migration 023
 * (move_category, reorder_category and the guard trigger) mirrors these rules.
 */
import { DAILY_CATEGORY_ID, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import type { Category, CategoryWithChildren } from '@/types/database';

/** A category, its subcategories and their subcategories: at most three levels (0, 1, 2). */
export const MAX_CATEGORY_LEVELS = 3;

export type CategoryMoveError = 'missing-category' | 'missing-parent' | 'self' | 'cycle' | 'too-deep';

/** Same error codes as validateCategoryMove; the parent check for a new category uses them too. */
export type CategoryParentError = CategoryMoveError;

export interface CategoryOption {
  id: string;
  label: string;
  /** 0 for a top-level category, 1 for its child, 2 for a sub-subcategory. */
  depth: number;
  parentId: string | null;
  /** Label of the parent, for options below the top level (disambiguates repeated names). */
  parentLabel: string | null;
}

/** Categories the upload and /shorts code depend on by id. They cannot be deleted. */
const PROTECTED_CATEGORY_IDS: ReadonlySet<string> = new Set([DAILY_CATEGORY_ID, SHORTS_CATEGORY_ID]);

export function isProtectedCategory(id: string): boolean {
  return PROTECTED_CATEGORY_IDS.has(id);
}

/** Code-unit comparison of strings, matching SQL `COLLATE "C"`. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** The sibling order: sort_order, then hebrew_name, then id. */
export function compareSiblings(a: Category, b: Category): number {
  return a.sort_order - b.sort_order || compareText(a.hebrew_name, b.hebrew_name) || compareText(a.id, b.id);
}

function ordered<T extends Category>(nodes: T[]): T[] {
  return [...nodes].sort(compareSiblings);
}

/** True when the category has an English name that differs from its Hebrew one. Legacy rows copied the Hebrew name into `name`; that counts as no English yet. */
export function hasEnglishName(category: Pick<Category, 'hebrew_name' | 'name'>): boolean {
  const english = category.name.trim();
  return english !== '' && english !== category.hebrew_name.trim();
}

/**
 * The name to show for a category in a locale. English pages use the English
 * name when there is one, else the Hebrew name. Never blank while either name is set.
 */
export function categoryLabel(category: Pick<Category, 'hebrew_name' | 'name'>, locale: string): string {
  if (locale === 'en' && hasEnglishName(category)) return category.name.trim();
  return category.hebrew_name.trim() || category.name.trim();
}

/**
 * Nests flat rows into the tree. Roots are rows without a parent, and rows whose
 * parent is not in `rows` (shown at the top rather than hidden). Input order does not matter.
 */
export function buildCategoryTree(rows: Category[]): CategoryWithChildren[] {
  const ids = new Set(rows.map((row) => row.id));
  const childrenByParent = new Map<string, Category[]>();
  const roots: Category[] = [];

  for (const row of rows) {
    if (row.parent_id && row.parent_id !== row.id && ids.has(row.parent_id)) {
      const siblings = childrenByParent.get(row.parent_id) ?? [];
      siblings.push(row);
      childrenByParent.set(row.parent_id, siblings);
    } else {
      roots.push(row);
    }
  }

  // A node is placed once; this also keeps a corrupt cycle out of the tree.
  const placed = new Set<string>();
  const build = (row: Category): CategoryWithChildren => {
    placed.add(row.id);
    const children = ordered(childrenByParent.get(row.id) ?? [])
      .filter((child) => !placed.has(child.id))
      .map(build);
    return { ...row, children };
  };
  return ordered(roots).map(build);
}

/** The sibling list (tree order) that contains `id`, or null when unknown. */
function containerOf(nodes: CategoryWithChildren[], id: string): CategoryWithChildren[] | null {
  if (nodes.some((node) => node.id === id)) return ordered(nodes);
  for (const node of nodes) {
    const found = containerOf(node.children, id);
    if (found) return found;
  }
  return null;
}

/** A category by id at any level. */
export function findCategory(tree: CategoryWithChildren[], id: string): CategoryWithChildren | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findCategory(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Depth of a category: 0 for top level, 1 for a subcategory, 2 for a sub-subcategory. Null when unknown. */
export function categoryDepth(tree: CategoryWithChildren[], id: string): number | null {
  const walk = (nodes: CategoryWithChildren[], depth: number): number | null => {
    for (const node of nodes) {
      if (node.id === id) return depth;
      const found = walk(node.children, depth + 1);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(tree, 0);
}

/** Levels below a node: 0 for a node without children, 1 when its children are leaves, and so on. */
export function subtreeHeight(node: Pick<CategoryWithChildren, 'children'>): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(subtreeHeight));
}

/** Ancestors of a category, top level first (empty for a top-level or unknown category). */
export function categoryAncestors(tree: CategoryWithChildren[], id: string): CategoryWithChildren[] {
  const walk = (nodes: CategoryWithChildren[], trail: CategoryWithChildren[]): CategoryWithChildren[] | null => {
    for (const node of nodes) {
      if (node.id === id) return trail;
      const found = walk(node.children, [...trail, node]);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, []) ?? [];
}

/** Direct children of a category, in sibling order (empty for a leaf or an unknown id). */
export function childrenOf(tree: CategoryWithChildren[], id: string): CategoryWithChildren[] {
  return ordered(findCategory(tree, id)?.children ?? []);
}

/**
 * The category and every descendant, depth-first in sibling order (the category
 * first). Empty for an unknown id.
 */
export function descendantCategories(tree: CategoryWithChildren[], id: string): CategoryWithChildren[] {
  const node = findCategory(tree, id);
  if (!node) return [];
  const nodes: CategoryWithChildren[] = [];
  const visit = (current: CategoryWithChildren) => {
    nodes.push(current);
    ordered(current.children).forEach(visit);
  };
  visit(node);
  return nodes;
}

/**
 * The category id and every descendant id, in the same order as descendantCategories.
 * Category pages, subtree counts and the lesson filter use this.
 */
export function descendantIds(tree: CategoryWithChildren[], id: string): string[] {
  return descendantCategories(tree, id).map((node) => node.id);
}

/**
 * Published lessons in a category's whole branch. `counts` are the subtree
 * totals (getCategoryLessonTotals), where a lesson in a parent and in its child
 * is counted once; summing direct counts would count it twice.
 */
export function categoryLessonTotal(counts: Record<string, number>, id: string): number {
  return counts[id] ?? 0;
}

/** The category and its whole branch as a standalone tree, for a picker that offers one branch. Empty when unknown. */
export function categorySubtree(tree: CategoryWithChildren[], id: string): CategoryWithChildren[] {
  const found = findCategory(tree, id);
  return found ? [found] : [];
}

/** True when the category or any descendant is protected. Deleting the category cascades to its whole branch, so this blocks it. */
export function containsProtectedCategory(tree: CategoryWithChildren[], id: string): boolean {
  return descendantIds(tree, id).some(isProtectedCategory);
}

/** Every category, depth-first (a parent, then its branch), with the depth and parent label a picker needs. */
export function categoryOptions(tree: CategoryWithChildren[], locale: string = 'he'): CategoryOption[] {
  const options: CategoryOption[] = [];
  const visit = (node: CategoryWithChildren, depth: number, parent: CategoryWithChildren | null) => {
    options.push({
      id: node.id,
      label: categoryLabel(node, locale),
      depth,
      parentId: parent?.id ?? null,
      parentLabel: parent ? categoryLabel(parent, locale) : null,
    });
    ordered(node.children).forEach((child) => visit(child, depth + 1, node));
  };
  ordered(tree).forEach((root) => visit(root, 0, null));
  return options;
}

/**
 * Why moving `id` under `newParentId` is not allowed (null when it is). `null`
 * means top level. The depth test uses the DEEPEST descendant of the moved
 * branch: the moved category lands at parentDepth + 1 and its subtree adds its height.
 */
export function validateCategoryMove({
  tree,
  id,
  newParentId,
}: {
  tree: CategoryWithChildren[];
  id: string;
  newParentId: string | null;
}): CategoryMoveError | null {
  const node = findCategory(tree, id);
  if (!node) return 'missing-category';

  let newDepth = 0;
  if (newParentId) {
    if (newParentId === id) return 'self';
    if (descendantIds(tree, id).includes(newParentId)) return 'cycle';
    const parentDepth = categoryDepth(tree, newParentId);
    if (parentDepth === null) return 'missing-parent';
    newDepth = parentDepth + 1;
  }

  if (newDepth + subtreeHeight(node) >= MAX_CATEGORY_LEVELS) return 'too-deep';
  return null;
}

/**
 * Why `parentId` cannot be the parent of a category (null when it can).
 * With `id`, the category already exists and this is a move; without it, a new category.
 * A null parent is always allowed (top level).
 */
export function validateCategoryParent({
  tree,
  id,
  parentId,
}: {
  tree: CategoryWithChildren[];
  id?: string;
  parentId: string | null | undefined;
}): CategoryParentError | null {
  if (id) return validateCategoryMove({ tree, id, newParentId: parentId || null });
  if (!parentId) return null;
  const parentDepth = categoryDepth(tree, parentId);
  if (parentDepth === null) return 'missing-parent';
  return parentDepth + 1 >= MAX_CATEGORY_LEVELS ? 'too-deep' : null;
}

export interface CategoryMoveTarget {
  /** null = top level. */
  parentId: string | null;
  /** The parent's label; null for top level (the caller words that). */
  label: string | null;
  /** Depth the category would have directly under this target. */
  depth: number;
}

/**
 * Parents a category can move to, for the "Move to…" control: top level and
 * every category that passes validateCategoryMove. Its current parent is left
 * out (moving there is a no-op; reordering uses reorderSiblings).
 */
export function validMoveTargets(
  tree: CategoryWithChildren[],
  id: string,
  locale: string = 'he',
): CategoryMoveTarget[] {
  if (!findCategory(tree, id)) return [];
  const ancestors = categoryAncestors(tree, id);
  const currentParent = ancestors.length > 0 ? ancestors[ancestors.length - 1].id : null;

  const targets: CategoryMoveTarget[] = [];
  if (currentParent !== null && validateCategoryMove({ tree, id, newParentId: null }) === null) {
    targets.push({ parentId: null, label: null, depth: 0 });
  }
  for (const option of categoryOptions(tree, locale)) {
    if (option.id === currentParent) continue;
    if (validateCategoryMove({ tree, id, newParentId: option.id }) === null) {
      targets.push({ parentId: option.id, label: option.label, depth: option.depth + 1 });
    }
  }
  return targets;
}

/** Sort order for a new category at the end of its siblings: max sibling sort_order + 1, or 0 when none. */
export function nextSortOrder(tree: CategoryWithChildren[], parentId: string | null): number {
  const siblings = parentId ? childrenOf(tree, parentId) : ordered(tree);
  return siblings.reduce((max, sibling) => Math.max(max, sibling.sort_order), -1) + 1;
}

/**
 * New sort orders for the siblings of `id` after it moves to `newIndex` among
 * them (0-based, clamped to the list). Every sibling is renumbered 0..n-1.
 * Null when the id is unknown or the index is not a finite number.
 */
export function reorderSiblings({
  tree,
  id,
  newIndex,
}: {
  tree: CategoryWithChildren[];
  id: string;
  newIndex: number;
}): Array<{ id: string; sort_order: number }> | null {
  if (!Number.isFinite(newIndex)) return null;
  const siblings = containerOf(tree, id);
  if (!siblings) return null;

  const order = siblings.map((sibling) => sibling.id).filter((siblingId) => siblingId !== id);
  const target = Math.min(Math.max(0, Math.trunc(newIndex)), order.length);
  order.splice(target, 0, id);
  return order.map((siblingId, sort_order) => ({ id: siblingId, sort_order }));
}
