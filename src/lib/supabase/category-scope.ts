import { isMissingLessonCategories } from './lesson-route';

/*
 * "Lessons in these categories": one scope for every category read (category
 * pages, category playback, /lessons?cat=). A lesson is in scope when ANY of
 * its memberships (lesson_categories, migration 026) is in the scope ids. The
 * embed is `!inner` so lessons outside the scope are dropped, and it is aliased
 * so it can sit beside other embeds (audio_type_match) without a name clash.
 *
 * Before migration 026 the same read filters lessons.category_id (the primary
 * category). Both modes return the same lesson shape, so callers do not branch.
 */

export const CATEGORY_SCOPE_ALIAS = 'category_scope';

/** The filter embed of membership mode. Selected only to filter: its rows are not read. */
export const CATEGORY_SCOPE_EMBED = `${CATEGORY_SCOPE_ALIAS}:lesson_categories!inner(category_id)`;

export type CategoryScopeMode = 'membership' | 'primary';

/** The subset of the PostgREST filter builder the scope needs. */
export interface ScopeFilterable<Q> {
  in(column: string, values: readonly string[]): Q;
}

export interface CategoryScope {
  readonly mode: CategoryScopeMode;
  /** Adds the scope embed to a column list (membership mode) or returns it unchanged (primary mode). */
  select(columns: string): string;
  /** Restricts a query that selects `select(...)` to the scope ids. */
  filter<Q extends ScopeFilterable<Q>>(query: Q): Q;
}

/** The scope for one mode. Pure: the query builder is the only thing it touches. */
export function categoryScope(scopeIds: readonly string[], mode: CategoryScopeMode): CategoryScope {
  if (mode === 'membership') {
    return {
      mode,
      select: (columns) => `${columns}, ${CATEGORY_SCOPE_EMBED}`,
      filter: (query) => query.in(`${CATEGORY_SCOPE_ALIAS}.category_id`, scopeIds),
    };
  }
  return {
    mode,
    select: (columns) => columns,
    filter: (query) => query.in('category_id', scopeIds),
  };
}

/**
 * Runs a read in membership mode. When the lesson_categories table is missing
 * (before migration 026), runs it again in primary mode. Any other error is
 * returned as it is, so a failed read still fails.
 */
export async function withCategoryScope<T extends { error: { code?: string; message?: string } | null }>(
  scopeIds: readonly string[],
  read: (scope: CategoryScope) => PromiseLike<T>,
): Promise<T> {
  const result = await read(categoryScope(scopeIds, 'membership'));
  if (result.error && isMissingLessonCategories(result.error)) {
    return await read(categoryScope(scopeIds, 'primary'));
  }
  return result;
}
