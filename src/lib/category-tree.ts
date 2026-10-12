/**
 * Pure rules for the category tree. Categories have two levels: top-level
 * categories, each with direct children. Shared by the admin page, the
 * category actions and <CategoryPicker>, so the rules live in one place.
 */
import { DAILY_CATEGORY_ID, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import type { Category, CategoryWithChildren } from '@/types/database';

export interface CategoryOption {
  id: string;
  label: string;
  /** 0 for a top-level category, 1 for its child. */
  depth: number;
  parentId: string | null;
}

export type CategoryParentError = 'self' | 'too-deep' | 'has-children' | 'missing-parent';

/** Categories the upload and /shorts code depend on by id. They cannot be deleted. */
const PROTECTED_CATEGORY_IDS: ReadonlySet<string> = new Set([DAILY_CATEGORY_ID, SHORTS_CATEGORY_ID]);

export function isProtectedCategory(id: string): boolean {
  return PROTECTED_CATEGORY_IDS.has(id);
}

export function categoryLabel(category: Pick<Category, 'hebrew_name' | 'name'>): string {
  return category.hebrew_name || category.name;
}

function bySortOrder(a: Category, b: Category): number {
  return a.sort_order - b.sort_order;
}

/** Every top-level category, each followed by its children, in sort order. */
export function categoryOptions(tree: CategoryWithChildren[]): CategoryOption[] {
  return [...tree].sort(bySortOrder).flatMap((parent) => [
    { id: parent.id, label: categoryLabel(parent), depth: 0, parentId: null },
    ...[...parent.children].sort(bySortOrder).map((child) => ({
      id: child.id,
      label: categoryLabel(child),
      depth: 1,
      parentId: parent.id,
    })),
  ]);
}

/** A category by id, top-level or child. */
export function findCategory(tree: CategoryWithChildren[], id: string): Category | undefined {
  for (const parent of tree) {
    if (parent.id === id) return parent;
    const child = parent.children.find((c) => c.id === id);
    if (child) return child;
  }
  return undefined;
}

/** Direct children of a top-level category, in sort order (empty for children and unknown ids). */
export function childrenOf(tree: CategoryWithChildren[], id: string): Category[] {
  return [...(tree.find((p) => p.id === id)?.children ?? [])].sort(bySortOrder);
}

/**
 * The category and its children as a standalone tree, for a picker that
 * must offer only one branch. Empty when the id is unknown.
 */
export function categorySubtree(tree: CategoryWithChildren[], id: string): CategoryWithChildren[] {
  const found = findCategory(tree, id);
  if (!found) return [];
  return [{ ...found, children: childrenOf(tree, id) }];
}

/** True when the category, or one of its direct children, is protected. Deleting it would remove a protected category. */
export function containsProtectedCategory(tree: CategoryWithChildren[], id: string): boolean {
  return isProtectedCategory(id) || childrenOf(tree, id).some((child) => isProtectedCategory(child.id));
}

/**
 * Why `parentId` cannot be the parent of `id` (omit `id` when creating).
 * Null means the parent is allowed. A null parent always is, since that makes a top-level category.
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
  if (!parentId) return null;
  if (id && parentId === id) return 'self';

  const parent = tree.find((p) => p.id === parentId);
  if (!parent) {
    const isChild = tree.some((p) => p.children.some((c) => c.id === parentId));
    return isChild ? 'too-deep' : 'missing-parent';
  }

  if (id && tree.some((p) => p.id === id && p.children.length > 0)) return 'has-children';
  return null;
}

/** Sort order for a new category at the end of its siblings: max sibling sort_order + 1, or 0 when none. */
export function nextSortOrder(tree: CategoryWithChildren[], parentId: string | null): number {
  const siblings: Category[] = parentId ? (tree.find((p) => p.id === parentId)?.children ?? []) : tree;
  return siblings.reduce((max, sibling) => Math.max(max, sibling.sort_order), -1) + 1;
}
