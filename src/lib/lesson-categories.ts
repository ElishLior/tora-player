import { categoryOptions, type CategoryOption } from '@/lib/category-tree';
import type { CategoryWithChildren } from '@/types/database';

/*
 * A lesson can sit in several categories (migration 026, lesson_categories).
 * The first category of its ordered selection is the PRIMARY one, stored in
 * lessons.category_id: the code that predates 026 and the single-valued
 * consumers (shorts, feed, notifications, uploads) read that column. These
 * rules are pure; the writes live in src/lib/supabase/lesson-category-writes.ts.
 */

/** Every category id in the tree, at any depth. */
function treeIds(tree: CategoryWithChildren[]): Set<string> {
  const ids = new Set<string>();
  const visit = (nodes: CategoryWithChildren[]) => {
    for (const node of nodes) {
      ids.add(node.id);
      visit(node.children ?? []);
    }
  };
  visit(tree);
  return ids;
}

/**
 * The selection as it will be saved: duplicates and unknown ids dropped, the
 * order kept. The first id is the primary category.
 */
export function normalizeCategorySelection(ids: readonly string[], tree: CategoryWithChildren[]): string[] {
  const known = treeIds(tree);
  const seen = new Set<string>();
  const selection: string[] = [];
  for (const id of ids) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    selection.push(id);
  }
  return selection;
}

/** The primary category of an ordered selection, or null when none is selected. */
export function primaryCategoryId(ids: readonly string[]): string | null {
  return ids[0] ?? null;
}

/** Ticking a category adds it after the others (the primary does not change); unticking removes it. */
export function toggleCategory(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

/** Makes a selected category the primary by moving it to the front. An unselected id leaves the selection as it is. */
export function makePrimaryCategory(ids: readonly string[], id: string): string[] {
  if (!ids.includes(id)) return [...ids];
  return [id, ...ids.filter((current) => current !== id)];
}

/** True when two selections hold the same categories in the same order (the primary included). */
export function sameCategorySelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * The picker's rows in tree order. Without a query every category is listed.
 * With one, a matching category keeps its ancestors (for context) and its
 * branch, so a match is never shown without its place in the tree.
 */
export function categoryPickerRows(tree: CategoryWithChildren[], locale: string, query: string = ''): CategoryOption[] {
  const options = categoryOptions(tree, locale);
  const needle = query.trim().toLocaleLowerCase(locale);
  if (!needle) return options;

  const indexById = new Map(options.map((option, index) => [option.id, index]));
  const keep = new Array<boolean>(options.length).fill(false);

  options.forEach((option, index) => {
    const matches = option.label.toLocaleLowerCase(locale).includes(needle);
    if (!matches) return;

    keep[index] = true;
    // Ancestors: walk up through parentId.
    let parentId = option.parentId;
    while (parentId) {
      const parentIndex = indexById.get(parentId);
      if (parentIndex === undefined) break;
      keep[parentIndex] = true;
      parentId = options[parentIndex].parentId;
    }
    // Branch: the following rows that sit deeper than the match (options are depth-first).
    for (let next = index + 1; next < options.length && options[next].depth > option.depth; next += 1) {
      keep[next] = true;
    }
  });

  return options.filter((_, index) => keep[index]);
}

/**
 * A lesson's categories for display and editing: its memberships when it has
 * any, else its primary alone (before migration 026, or a lesson whose
 * membership rows are missing), else none.
 */
export function categorySelectionFor(memberships: readonly string[] | null, primary: string | null): string[] {
  if (memberships && memberships.length > 0) return [...memberships];
  return primary ? [primary] : [];
}

/**
 * How many lessons would have no category left if the categories in `scopeIds`
 * were deleted: a lesson is lost when every one of its categories is in scope.
 * Pass each candidate lesson with its full list of categories.
 */
export function lessonsLeftWithoutCategory(
  lessons: readonly { categoryIds: readonly string[] }[],
  scopeIds: readonly string[],
): number {
  const scope = new Set(scopeIds);
  return lessons.filter((lesson) => lesson.categoryIds.every((id) => scope.has(id))).length;
}
