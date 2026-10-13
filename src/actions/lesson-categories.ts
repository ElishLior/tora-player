'use server';

import { revalidateCatalog } from '@/lib/supabase/anon';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getCategoriesTree } from '@/lib/supabase/queries';
import {
  addLessonCategory,
  readLessonCategoryIds,
  removeLessonCategory,
  setLessonCategoryOnMany,
  writeLessonCategories,
} from '@/lib/supabase/lesson-category-writes';
import { isAdmin } from '@/lib/auth/admin';
import { isUuid } from '@/lib/lesson-slugs';
import { categorySelectionFor, normalizeCategorySelection } from '@/lib/lesson-categories';

/*
 * A lesson's categories (migration 026). Every action checks isAdmin() and
 * writes with the service role. The membership rules are in
 * src/lib/lesson-categories.ts; the writes in src/lib/supabase/lesson-category-writes.ts.
 */

/**
 * `membershipsSaved` is false when migration 026 is not applied yet: only the
 * primary category was saved, so the UI says that several categories need it.
 */
export type LessonCategoriesResult =
  | { categoryIds: string[]; primaryCategoryId: string | null; membershipsSaved: boolean }
  | { error: 'not-admin' | 'invalid' | 'failed' };

export type BulkCategoryMode = 'set' | 'add' | 'remove';

export type BulkCategoryResult = { membershipsSaved: boolean } | { error: 'not-admin' | 'invalid' | 'failed' };

/**
 * Replaces one lesson's categories with `categoryIds`, in order: the first one
 * is the primary. Unknown and duplicate ids are dropped. Empty clears them.
 */
export async function setLessonCategories(lessonId: string, categoryIds: string[]): Promise<LessonCategoriesResult> {
  if (!(await isAdmin())) return { error: 'not-admin' };
  if (!isUuid(lessonId) || !categoryIds.every(isUuid)) return { error: 'invalid' };

  try {
    const supabase = createAdminSupabaseClient();
    const tree = await getCategoriesTree(supabase);
    const selection = normalizeCategorySelection(categoryIds, tree);

    const result = await writeLessonCategories(supabase, lessonId, selection);
    if ('error' in result) return { error: 'failed' };

    revalidateCatalog();
    return {
      categoryIds: selection,
      primaryCategoryId: result.primaryCategoryId,
      membershipsSaved: result.membershipsSaved,
    };
  } catch {
    return { error: 'failed' };
  }
}

/**
 * The bulk bar on the lessons list. "set" replaces every selected lesson's
 * categories with one (or clears them with null); "add" and "remove" change a
 * single category and leave the others alone.
 */
export async function bulkChangeLessonCategories(
  lessonIds: string[],
  mode: BulkCategoryMode,
  categoryId: string | null,
): Promise<BulkCategoryResult> {
  if (!(await isAdmin())) return { error: 'not-admin' };
  if (lessonIds.length === 0 || !lessonIds.every(isUuid)) return { error: 'invalid' };
  if (categoryId !== null && !isUuid(categoryId)) return { error: 'invalid' };
  if ((mode === 'add' || mode === 'remove') && categoryId === null) return { error: 'invalid' };

  try {
    const supabase = createAdminSupabaseClient();
    const result =
      mode === 'set'
        ? await setLessonCategoryOnMany(supabase, lessonIds, categoryId)
        : mode === 'add'
          ? await addLessonCategory(supabase, lessonIds, categoryId as string)
          : await removeLessonCategory(supabase, lessonIds, categoryId as string);
    if ('error' in result) return { error: 'failed' };

    revalidateCatalog();
    return { membershipsSaved: result.membershipsSaved };
  } catch {
    return { error: 'failed' };
  }
}

/**
 * A lesson's categories, primary first, for the editors. Before migration 026
 * this is the primary category alone.
 */
export async function getLessonCategoryIds(
  lessonId: string,
): Promise<{ categoryIds: string[] } | { error: 'not-admin' | 'invalid' | 'failed' }> {
  if (!(await isAdmin())) return { error: 'not-admin' };
  if (!isUuid(lessonId)) return { error: 'invalid' };

  try {
    const supabase = createAdminSupabaseClient();
    const [memberships, lesson] = await Promise.all([
      readLessonCategoryIds(supabase, lessonId),
      supabase.from('lessons').select('category_id').eq('id', lessonId).maybeSingle(),
    ]);
    if (lesson.error) return { error: 'failed' };
    const primary = (lesson.data?.category_id as string | null | undefined) ?? null;
    return { categoryIds: categorySelectionFor(memberships, primary) };
  } catch {
    return { error: 'failed' };
  }
}
