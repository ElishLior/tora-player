import type { SupabaseClient } from '@supabase/supabase-js';
import { primaryCategoryId } from '@/lib/lesson-categories';
import { isMissingLessonCategories } from './lesson-route';

/*
 * Writes to a lesson's categories (migration 026). Service role only: callers
 * run requireAdmin() first (src/actions/lesson-categories.ts). Each function
 * keeps lessons.category_id (the primary) and lesson_categories in step, in the
 * order the trigger in 026 expects: primary first, then the rows.
 *
 * Before migration 026 the membership write fails with a missing-table error.
 * Then only the primary is written and `membershipsSaved` is false, so the UI
 * can say that several categories need the migration.
 */

export type CategoryWriteResult = { membershipsSaved: boolean; primaryCategoryId: string | null } | { error: string };

/**
 * Replaces one lesson's categories with `categoryIds` (ordered; the first is
 * the primary). Duplicates must be removed by the caller (normalizeCategorySelection).
 */
export async function writeLessonCategories(
  client: SupabaseClient,
  lessonId: string,
  categoryIds: readonly string[],
): Promise<CategoryWriteResult> {
  const primary = primaryCategoryId(categoryIds);

  // 1. The primary first: the trigger takes the old primary's row out and ensures the new one.
  const primaryWrite = await client.from('lessons').update({ category_id: primary }).eq('id', lessonId);
  if (primaryWrite.error) return { error: primaryWrite.error.message };

  // 2. Upsert the whole selection with positions (the primary is position 0).
  if (categoryIds.length > 0) {
    const rows = categoryIds.map((categoryId, position) => ({
      lesson_id: lessonId,
      category_id: categoryId,
      position,
    }));
    const upsert = await client.from('lesson_categories').upsert(rows, { onConflict: 'lesson_id,category_id' });
    if (upsert.error) {
      if (isMissingLessonCategories(upsert.error)) return { membershipsSaved: false, primaryCategoryId: primary };
      return { error: upsert.error.message };
    }
  }

  // 3. Drop memberships that are no longer selected.
  let remove = client.from('lesson_categories').delete().eq('lesson_id', lessonId);
  if (categoryIds.length > 0) remove = remove.not('category_id', 'in', `(${categoryIds.join(',')})`);
  const removal = await remove;
  if (removal.error) {
    if (isMissingLessonCategories(removal.error)) return { membershipsSaved: false, primaryCategoryId: primary };
    return { error: removal.error.message };
  }

  return { membershipsSaved: true, primaryCategoryId: primary };
}

/**
 * Adds one category to many lessons. Lessons with no primary take it as their
 * primary; every other lesson gets it as an extra category (ignored when it is
 * already there, so an existing position is kept).
 */
export async function addLessonCategory(
  client: SupabaseClient,
  lessonIds: readonly string[],
  categoryId: string,
): Promise<CategoryWriteResult> {
  const primaryWrite = await client
    .from('lessons')
    .update({ category_id: categoryId })
    .in('id', [...lessonIds])
    .is('category_id', null);
  if (primaryWrite.error) return { error: primaryWrite.error.message };

  const rows = lessonIds.map((lessonId) => ({ lesson_id: lessonId, category_id: categoryId, position: 1 }));
  const upsert = await client
    .from('lesson_categories')
    .upsert(rows, { onConflict: 'lesson_id,category_id', ignoreDuplicates: true });
  if (upsert.error) {
    if (isMissingLessonCategories(upsert.error)) return { membershipsSaved: false, primaryCategoryId: null };
    return { error: upsert.error.message };
  }
  return { membershipsSaved: true, primaryCategoryId: null };
}

/**
 * Removes one category from many lessons. A lesson whose primary was removed
 * takes its next category (lowest position) as the new primary, or none.
 * Before migration 026 only lessons whose primary is this category lose it.
 */
export async function removeLessonCategory(
  client: SupabaseClient,
  lessonIds: readonly string[],
  categoryId: string,
): Promise<CategoryWriteResult> {
  const ids = [...lessonIds];
  const removal = await client.from('lesson_categories').delete().in('lesson_id', ids).eq('category_id', categoryId);
  if (removal.error) {
    if (!isMissingLessonCategories(removal.error)) return { error: removal.error.message };
    const cleared = await client
      .from('lessons')
      .update({ category_id: null })
      .in('id', ids)
      .eq('category_id', categoryId);
    if (cleared.error) return { error: cleared.error.message };
    return { membershipsSaved: false, primaryCategoryId: null };
  }

  // Lessons that lost their primary: the first remaining membership becomes the primary.
  const affected = await client.from('lessons').select('id').in('id', ids).eq('category_id', categoryId);
  if (affected.error) return { error: affected.error.message };
  const promoted = await promoteNextPrimaries(client, ((affected.data ?? []) as { id: string }[]).map((row) => row.id));
  if ('error' in promoted) return promoted;
  return { membershipsSaved: true, primaryCategoryId: null };
}

/**
 * After a category is deleted, its lessons' primary is null (ON DELETE SET NULL)
 * while their other memberships survive. Each such lesson takes its first
 * remaining category as primary. Call it right after the delete.
 */
export async function promoteOrphanedPrimaries(
  client: SupabaseClient,
): Promise<{ promoted: number } | { error: string }> {
  const orphans = await client
    .from('lesson_categories')
    .select('lesson_id, lesson:lessons!inner(category_id)')
    .is('lesson.category_id', null);
  if (orphans.error) {
    if (isMissingLessonCategories(orphans.error)) return { promoted: 0 };
    return { error: orphans.error.message };
  }
  const lessonIds = [...new Set(((orphans.data ?? []) as { lesson_id: string }[]).map((row) => row.lesson_id))];
  const promoted = await promoteNextPrimaries(client, lessonIds);
  if ('error' in promoted) return promoted;
  return { promoted: lessonIds.length };
}

/**
 * Each lesson takes its first remaining membership (lowest position, then
 * created_at) as primary, or none. Lessons are grouped by the new primary, so
 * each value is one update.
 */
async function promoteNextPrimaries(
  client: SupabaseClient,
  lessonIds: readonly string[],
): Promise<{ error: string } | { promoted: true }> {
  if (lessonIds.length === 0) return { promoted: true };
  const remaining = await client
    .from('lesson_categories')
    .select('lesson_id, category_id')
    .in('lesson_id', [...lessonIds])
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (remaining.error) return { error: remaining.error.message };

  const nextPrimary = new Map<string, string>();
  for (const row of (remaining.data ?? []) as { lesson_id: string; category_id: string }[]) {
    if (!nextPrimary.has(row.lesson_id)) nextPrimary.set(row.lesson_id, row.category_id);
  }

  const groups = new Map<string | null, string[]>();
  for (const lessonId of lessonIds) {
    const primary = nextPrimary.get(lessonId) ?? null;
    groups.set(primary, [...(groups.get(primary) ?? []), lessonId]);
  }
  for (const [primary, group] of groups) {
    const update = await client.from('lessons').update({ category_id: primary }).in('id', group);
    if (update.error) return { error: update.error.message };
  }
  return { promoted: true };
}

/**
 * Sets the category of many lessons, replacing their categories (the bulk
 * "set" of the lessons list). `null` clears them.
 */
export async function setLessonCategoryOnMany(
  client: SupabaseClient,
  lessonIds: readonly string[],
  categoryId: string | null,
): Promise<CategoryWriteResult> {
  const ids = [...lessonIds];
  // The primary first: the trigger takes each old primary's row out and ensures the new one.
  const primaryWrite = await client.from('lessons').update({ category_id: categoryId }).in('id', ids);
  if (primaryWrite.error) return { error: primaryWrite.error.message };

  let others = client.from('lesson_categories').delete().in('lesson_id', ids);
  if (categoryId) others = others.neq('category_id', categoryId);
  const removal = await others;
  if (removal.error) {
    if (isMissingLessonCategories(removal.error)) return { membershipsSaved: false, primaryCategoryId: categoryId };
    return { error: removal.error.message };
  }
  return { membershipsSaved: true, primaryCategoryId: categoryId };
}

/**
 * The categories of a lesson in order (primary first), or null when the table
 * is missing (before migration 026). Read it with the client the page is allowed to read.
 */
export async function readLessonCategoryIds(client: SupabaseClient, lessonId: string): Promise<string[] | null> {
  const { data, error } = await client
    .from('lesson_categories')
    .select('category_id')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingLessonCategories(error)) return null;
    throw error;
  }
  return ((data ?? []) as { category_id: string }[]).map((row) => row.category_id);
}
