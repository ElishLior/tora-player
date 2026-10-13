'use server';

import type { ZodError } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidateCatalog } from '@/lib/supabase/anon';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { getCategoriesTree } from '@/lib/supabase/queries';
import { createCategorySchema, updateCategorySchema } from '@/lib/validators';
import { isAdmin } from '@/lib/auth/admin';
import { isMissingLessonCategories } from '@/lib/supabase/lesson-route';
import { promoteOrphanedPrimaries } from '@/lib/supabase/lesson-category-writes';
import { lessonsLeftWithoutCategory } from '@/lib/lesson-categories';
import {
  buildCategoryTree,
  containsProtectedCategory,
  descendantIds,
  findCategory,
  nextSortOrder,
  reorderSiblings,
  validateCategoryMove,
  validateCategoryParent,
  type CategoryParentError,
} from '@/lib/category-tree';
import type { Category, CategoryWithChildren } from '@/types/database';

/**
 * Field errors for the category form, keyed by field name. `_form` holds the
 * errors that belong to no single field.
 */
export type CategoryFieldErrors = Record<string, string[] | undefined>;

/**
 * Failures of a move or reorder. The admin page words them (see categoryAdmin
 * in messages/), so the action returns a code, not a sentence.
 */
export type CategoryActionError =
  | 'not-admin'
  | 'failed'
  | 'migration-missing'
  | 'stale'
  | 'missing-category'
  | 'missing-parent'
  | 'self'
  | 'cycle'
  | 'too-deep';

const NOT_ADMIN = 'אין הרשאה לביצוע הפעולה';

const PARENT_ERRORS: Record<CategoryParentError, string> = {
  'missing-category': 'הקטגוריה לא נמצאה',
  self: 'קטגוריה לא יכולה להיות קטגוריית האב של עצמה',
  cycle: 'אי אפשר להעביר קטגוריה אל אחת מתתי-הקטגוריות שלה',
  'missing-parent': 'קטגוריית האב לא נמצאה',
  'too-deep': 'אפשר שלוש רמות לכל היותר: אי אפשר להוסיף תת-קטגוריה מתחת לתת-קטגוריה',
};

/** Changing a parent goes through moveCategory, which is atomic and checks the whole branch. */
const PARENT_CHANGE_ERROR = 'כדי להעביר קטגוריה לאב אחר, השתמשו באפשרות "העברה אל…"';

const PROTECTED_DELETE_ERROR = 'קטגוריה זו, או תת-קטגוריה שלה, משמשת את העלאת השיעורים ולא ניתן למחוק אותה';

/** SQLSTATEs raised by migration 023 (see the header of supabase/migrations/023_category_moves.sql). */
const TREE_ERROR_CODES: Record<string, CategoryActionError> = {
  CAT01: 'stale',
  CAT02: 'missing-category',
  CAT03: 'self',
  CAT04: 'cycle',
  CAT05: 'too-deep',
  CAT06: 'missing-parent',
};

/** A function missing from the database: 42883 from Postgres, PGRST202 from PostgREST. */
function isMissingFunction(error: { code?: string | null }): boolean {
  return error.code === '42883' || error.code === 'PGRST202';
}

/** Trimmed text of a form field, '' when missing. */
function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function zodErrors(error: ZodError): CategoryFieldErrors {
  const { fieldErrors, formErrors } = error.flatten();
  return { ...fieldErrors, ...(formErrors.length > 0 ? { _form: formErrors } : {}) };
}

// ==================== READ ====================

export async function getCategories(): Promise<{ data?: CategoryWithChildren[]; error?: string }> {
  try {
    const supabase = await requireServerSupabaseClient();

    const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true });

    if (error) {
      return { error: error.message };
    }

    return { data: buildCategoryTree(data as Category[]) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch categories' };
  }
}

/** Lessons in a category and in all its subcategories: what a delete would leave without a category. */
export async function countCategoryLessons(id: string): Promise<{ count: number } | { error: string }> {
  if (!(await isAdmin())) {
    return { error: NOT_ADMIN };
  }

  try {
    const supabase = createAdminSupabaseClient();
    const tree = await getCategoriesTree(supabase);
    const ids = descendantIds(tree, id);

    // Counts drafts too (the public RPC counts published lessons only). A lesson is
    // lost when every one of its categories is in the branch. Before migration 026
    // only the primary category is known, so it decides.
    const scoped = await supabase
      .from('lessons')
      .select('id, memberships:lesson_categories(category_id), scope:lesson_categories!inner(category_id)')
      .in('scope.category_id', ids);
    if (scoped.error && isMissingLessonCategories(scoped.error)) {
      const { count, error } = await supabase
        .from('lessons')
        .select('id', { count: 'exact', head: true })
        .in('category_id', ids);
      if (error) return { error: error.message };
      return { count: count ?? 0 };
    }
    if (scoped.error) return { error: scoped.error.message };

    const lessons = ((scoped.data ?? []) as { memberships: { category_id: string }[] }[]).map((row) => ({
      categoryIds: row.memberships.map((membership) => membership.category_id),
    }));
    return { count: lessonsLeftWithoutCategory(lessons, ids) };
  } catch {
    return { error: 'לא ניתן לספור את השיעורים של הקטגוריה' };
  }
}

// ==================== CREATE ====================

export async function createCategory(formData: FormData): Promise<{ data: Category } | { error: CategoryFieldErrors }> {
  if (!(await isAdmin())) {
    return { error: { _form: [NOT_ADMIN] } };
  }

  try {
    // A blank English name is stored as ''. categoryLabel() shows the Hebrew name until one is given.
    const hebrewName = text(formData, 'hebrew_name');
    const parentId = text(formData, 'parent_id') || null;

    const parsed = createCategorySchema.safeParse({
      hebrew_name: hebrewName,
      name: text(formData, 'name'),
      description: text(formData, 'description') || null,
      icon: text(formData, 'icon') || null,
      parent_id: parentId,
    });
    if (!parsed.success) {
      return { error: zodErrors(parsed.error) };
    }

    const supabase = createAdminSupabaseClient();
    const tree = await getCategoriesTree(supabase);

    const problem = validateCategoryParent({ tree, parentId });
    if (problem) {
      return { error: { parent_id: [PARENT_ERRORS[problem]] } };
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({
        ...parsed.data,
        name: parsed.data.name ?? '',
        parent_id: parentId,
        sort_order: nextSortOrder(tree, parentId),
      })
      .select()
      .single();

    if (error) {
      return { error: { _form: [`לא ניתן לשמור את הקטגוריה (${error.message})`] } };
    }

    revalidateCatalog();
    return { data: data as Category };
  } catch {
    return { error: { _form: ['לא ניתן ליצור את הקטגוריה'] } };
  }
}

// ==================== UPDATE ====================

/**
 * Renames and edits a category. Only the fields the form sent are written, so
 * changing the Hebrew name never touches the English one, and the reverse holds too.
 * The parent is not changed here (see moveCategory). `expectedUpdatedAt` is the
 * category's updated_at as the admin read it; a changed category is refused ('stale').
 */
export async function updateCategory(
  id: string,
  formData: FormData,
  expectedUpdatedAt: string,
): Promise<{ data: Category } | { error: CategoryFieldErrors | 'stale' }> {
  if (!(await isAdmin())) {
    return { error: { _form: [NOT_ADMIN] } };
  }

  try {
    const parsed = updateCategorySchema.safeParse({
      hebrew_name: formData.has('hebrew_name') ? text(formData, 'hebrew_name') : undefined,
      name: formData.has('name') ? text(formData, 'name') : undefined,
      description: formData.has('description') ? text(formData, 'description') || null : undefined,
      icon: formData.has('icon') ? text(formData, 'icon') || null : undefined,
    });
    if (!parsed.success) {
      return { error: zodErrors(parsed.error) };
    }

    const supabase = createAdminSupabaseClient();
    const tree = await getCategoriesTree(supabase);
    const current = findCategory(tree, id);
    if (!current) {
      return { error: { _form: ['הקטגוריה לא נמצאה'] } };
    }

    if (formData.has('parent_id') && (text(formData, 'parent_id') || null) !== current.parent_id) {
      return { error: { parent_id: [PARENT_CHANGE_ERROR] } };
    }

    // The write only applies to the version the admin read: 0 rows means someone else changed it since.
    const { data, error } = await supabase
      .from('categories')
      .update(parsed.data)
      .eq('id', id)
      .eq('updated_at', expectedUpdatedAt)
      .select()
      .maybeSingle();

    if (error) {
      return { error: { _form: [`לא ניתן לשמור את הקטגוריה (${error.message})`] } };
    }
    if (!data) return { error: 'stale' };

    revalidateCatalog();
    return { data: data as Category };
  } catch {
    return { error: { _form: ['לא ניתן לעדכן את הקטגוריה'] } };
  }
}

// ==================== MOVE AND REORDER ====================

/**
 * Moves a category (with its whole branch) under `newParentId` (null = top
 * level) at `newIndex` among the new siblings. `expectedUpdatedAt` is the
 * category's updated_at as the admin read it; a changed category is refused
 * ('stale') so nobody overwrites another admin's edit. Atomic in migration 023.
 */
export async function moveCategory(
  id: string,
  newParentId: string | null,
  newIndex: number,
  expectedUpdatedAt: string,
): Promise<{ success: true } | { error: CategoryActionError }> {
  if (!(await isAdmin())) {
    return { error: 'not-admin' };
  }

  try {
    const supabase = createAdminSupabaseClient();

    // Friendly rules first, from the same tree the database checks. The database still decides.
    const tree = await getCategoriesTree(supabase);
    const problem = validateCategoryMove({ tree, id, newParentId });
    if (problem) return { error: problem };

    const { error } = await supabase.rpc('move_category', {
      p_id: id,
      p_new_parent: newParentId,
      p_new_index: newIndex,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) return { error: moveErrorFrom(error) };

    revalidateCatalog();
    return { success: true };
  } catch {
    return { error: 'failed' };
  }
}

/**
 * Moves a category to `newIndex` among its current siblings (the up and down
 * buttons). Uses reorder_category (migration 023). Without that migration it
 * falls back to a non-atomic renumbering with the same stale check.
 */
export async function reorderCategory(
  id: string,
  newIndex: number,
  expectedUpdatedAt: string,
): Promise<{ success: true } | { error: CategoryActionError }> {
  if (!(await isAdmin())) {
    return { error: 'not-admin' };
  }

  try {
    const supabase = createAdminSupabaseClient();

    const { error } = await supabase.rpc('reorder_category', {
      p_id: id,
      p_new_index: newIndex,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (!error) {
      revalidateCatalog();
      return { success: true };
    }
    if (!isMissingFunction(error)) return { error: moveErrorFrom(error) };

    return await reorderWithoutMigration(supabase, id, newIndex, expectedUpdatedAt);
  } catch {
    return { error: 'failed' };
  }
}

/** Before migration 023: the same renumbering as plain updates. Not atomic; the stale check is read-then-write. */
async function reorderWithoutMigration(
  supabase: SupabaseClient,
  id: string,
  newIndex: number,
  expectedUpdatedAt: string,
): Promise<{ success: true } | { error: CategoryActionError }> {
  const tree = await getCategoriesTree(supabase);
  const current = findCategory(tree, id);
  if (!current) return { error: 'missing-category' };
  if (current.updated_at !== expectedUpdatedAt) return { error: 'stale' };

  const next = reorderSiblings({ tree, id, newIndex });
  if (!next) return { error: 'failed' };

  const changed = next.filter((row) => findCategory(tree, row.id)?.sort_order !== row.sort_order);
  const results = await Promise.all(
    changed.map((row) => supabase.from('categories').update({ sort_order: row.sort_order }).eq('id', row.id)),
  );
  if (results.some((result) => result.error)) return { error: 'failed' };

  revalidateCatalog();
  return { success: true };
}

function moveErrorFrom(error: { code?: string | null }): CategoryActionError {
  if (isMissingFunction(error)) return 'migration-missing';
  return TREE_ERROR_CODES[error.code ?? ''] ?? 'failed';
}

// ==================== DELETE ====================

export async function deleteCategory(id: string): Promise<{ success: true } | { error: string }> {
  if (!(await isAdmin())) {
    return { error: NOT_ADMIN };
  }

  try {
    const supabase = createAdminSupabaseClient();
    const tree = await getCategoriesTree(supabase);
    if (!findCategory(tree, id)) {
      return { error: 'הקטגוריה לא נמצאה' };
    }
    // Deleting a category also deletes its whole branch, so a protected category anywhere in it blocks the delete.
    if (containsProtectedCategory(tree, id)) {
      return { error: PROTECTED_DELETE_ERROR };
    }

    // The migrations set lessons.category_id ON DELETE SET NULL, so lessons of the
    // category and of its subcategories lose their category in the same statement.
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      return { error: `לא ניתן למחוק את הקטגוריה (${error.message})` };
    }

    // Lessons whose primary was in the branch now have none; each takes its next category (migration 026).
    const promotion = await promoteOrphanedPrimaries(supabase);
    if ('error' in promotion) console.error('Category delete: could not promote lesson primaries', promotion.error);

    revalidateCatalog();
    return { success: true };
  } catch {
    return { error: 'לא ניתן למחוק את הקטגוריה' };
  }
}
