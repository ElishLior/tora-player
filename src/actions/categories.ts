'use server';

import type { ZodError } from 'zod';
import { revalidateCatalog } from '@/lib/supabase/anon';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { getCategoriesTree } from '@/lib/supabase/queries';
import { createCategorySchema, updateCategorySchema } from '@/lib/validators';
import { isAdmin } from '@/lib/auth/admin';
import {
  childrenOf,
  containsProtectedCategory,
  findCategory,
  nextSortOrder,
  validateCategoryParent,
  type CategoryParentError,
} from '@/lib/category-tree';
import type { Category, CategoryWithChildren } from '@/types/database';

/**
 * Field errors for the category form, keyed by field name. `_form` holds the
 * errors that belong to no single field.
 */
export type CategoryFieldErrors = Record<string, string[] | undefined>;

const NOT_ADMIN = 'אין הרשאה לביצוע הפעולה';

const PARENT_ERRORS: Record<CategoryParentError, string> = {
  self: 'קטגוריה לא יכולה להיות קטגוריית האב של עצמה',
  'too-deep': 'אפשר שתי רמות בלבד: תת-קטגוריה לא יכולה להיות קטגוריית אב',
  'has-children': 'לקטגוריה זו יש תתי-קטגוריות, לכן היא נשארת ברמה הראשית',
  'missing-parent': 'קטגוריית האב לא נמצאה',
};

const PROTECTED_DELETE_ERROR = 'קטגוריה זו, או תת-קטגוריה שלה, משמשת את העלאת השיעורים ולא ניתן למחוק אותה';

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

    const all = data as Category[];

    // Build tree: top-level categories with children nested
    const topLevel = all.filter((c) => !c.parent_id);
    const tree: CategoryWithChildren[] = topLevel.map((parent) => ({
      ...parent,
      children: all.filter((c) => c.parent_id === parent.id).sort((a, b) => a.sort_order - b.sort_order),
    }));

    return { data: tree };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch categories' };
  }
}

/** Lessons in a category and in its children: what a delete would leave without a category. */
export async function countCategoryLessons(id: string): Promise<{ count: number } | { error: string }> {
  if (!(await isAdmin())) {
    return { error: NOT_ADMIN };
  }

  try {
    const supabase = createAdminSupabaseClient();
    const tree = await getCategoriesTree(supabase);
    const ids = [id, ...childrenOf(tree, id).map((child) => child.id)];

    // Counts drafts too. The public RPC counts published lessons only.
    const { count, error } = await supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .in('category_id', ids);

    if (error) return { error: error.message };
    return { count: count ?? 0 };
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
    // The database requires `name`, so a blank English name falls back to the Hebrew one.
    const hebrewName = text(formData, 'hebrew_name');
    const parentId = text(formData, 'parent_id') || null;

    const parsed = createCategorySchema.safeParse({
      hebrew_name: hebrewName,
      name: text(formData, 'name') || hebrewName,
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
      .insert({ ...parsed.data, parent_id: parentId, sort_order: nextSortOrder(tree, parentId) })
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

export async function updateCategory(
  id: string,
  formData: FormData,
): Promise<{ data: Category } | { error: CategoryFieldErrors }> {
  if (!(await isAdmin())) {
    return { error: { _form: [NOT_ADMIN] } };
  }

  try {
    // Only fields the form sent are updated. A blank English name becomes the Hebrew name.
    const hebrewName = formData.has('hebrew_name') ? text(formData, 'hebrew_name') : undefined;
    const name = formData.has('name') ? text(formData, 'name') || hebrewName : undefined;

    const parsed = updateCategorySchema.safeParse({
      hebrew_name: hebrewName,
      name: name || undefined,
      description: formData.has('description') ? text(formData, 'description') || null : undefined,
      icon: formData.has('icon') ? text(formData, 'icon') || null : undefined,
      parent_id: formData.has('parent_id') ? text(formData, 'parent_id') || null : undefined,
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

    const changes: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.parent_id !== undefined) {
      const parentId = parsed.data.parent_id;
      const problem = validateCategoryParent({ tree, id, parentId });
      if (problem) {
        return { error: { parent_id: [PARENT_ERRORS[problem]] } };
      }
      // Moving to another parent puts the category last among its new siblings.
      if ((current.parent_id ?? null) !== (parentId ?? null)) {
        changes.sort_order = nextSortOrder(tree, parentId ?? null);
      }
    }

    const { data, error } = await supabase.from('categories').update(changes).eq('id', id).select().single();

    if (error) {
      return { error: { _form: [`לא ניתן לשמור את הקטגוריה (${error.message})`] } };
    }

    revalidateCatalog();
    return { data: data as Category };
  } catch {
    return { error: { _form: ['לא ניתן לעדכן את הקטגוריה'] } };
  }
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
    // Deleting a parent also deletes its children, so a protected child blocks it too.
    if (containsProtectedCategory(tree, id)) {
      return { error: PROTECTED_DELETE_ERROR };
    }

    // The migrations set lessons.category_id ON DELETE SET NULL, so lessons of the
    // category and of its children lose their category in the same statement.
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      return { error: `לא ניתן למחוק את הקטגוריה (${error.message})` };
    }

    revalidateCatalog();
    return { success: true };
  } catch {
    return { error: 'לא ניתן למחוק את הקטגוריה' };
  }
}

// ==================== REORDER ====================

export async function reorderCategories(categoryIds: string[]): Promise<{ success: true } | { error: string }> {
  if (!(await isAdmin())) {
    return { error: NOT_ADMIN };
  }

  try {
    const supabase = createAdminSupabaseClient();

    // Update sort_order for each category based on its position in the array
    const updates = categoryIds.map((id, index) =>
      supabase.from('categories').update({ sort_order: index }).eq('id', id),
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) return { error: `לא ניתן לשנות את הסדר (${failed.error.message})` };

    revalidateCatalog();
    return { success: true };
  } catch {
    return { error: 'לא ניתן לשנות את הסדר' };
  }
}

// ==================== LESSON CATEGORY ====================

/** Sets one lesson's category from the lesson page or the lesson editor. `null` clears it. */
export async function updateLessonCategory(
  lessonId: string,
  categoryId: string | null,
): Promise<{ categoryId: string | null } | { error: string }> {
  if (!(await isAdmin())) {
    return { error: NOT_ADMIN };
  }

  try {
    const supabase = createAdminSupabaseClient();

    if (categoryId) {
      const { data, error } = await supabase.from('categories').select('id').eq('id', categoryId).maybeSingle();
      if (error) return { error: 'לא ניתן לבדוק את הקטגוריה' };
      if (!data) return { error: 'הקטגוריה לא נמצאה' };
    }

    const { error } = await supabase
      .from('lessons')
      .update({ category_id: categoryId })
      .eq('id', lessonId)
      .select('id')
      .single();
    if (error) return { error: 'לא ניתן לעדכן את הקטגוריה של השיעור' };

    revalidateCatalog();
    return { categoryId };
  } catch {
    return { error: 'לא ניתן לעדכן את הקטגוריה של השיעור' };
  }
}
