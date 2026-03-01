'use server';

import { revalidatePath } from 'next/cache';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { createCategorySchema, updateCategorySchema } from '@/lib/validators';
import { isAdmin } from '@/actions/auth';
import type { Category, CategoryWithChildren } from '@/types/database';

// ==================== READ ====================

export async function getCategories(): Promise<{ data?: CategoryWithChildren[]; error?: string }> {
  try {
    const supabase = await requireServerSupabaseClient();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      return { error: error.message };
    }

    const all = data as Category[];

    // Build tree: top-level categories with children nested
    const topLevel = all.filter(c => !c.parent_id);
    const tree: CategoryWithChildren[] = topLevel.map(parent => ({
      ...parent,
      children: all
        .filter(c => c.parent_id === parent.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }));

    return { data: tree };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch categories' };
  }
}

// ==================== CREATE ====================

export async function createCategory(formData: FormData) {
  if (!(await isAdmin())) {
    return { error: { _form: ['Unauthorized'] } };
  }
  const supabase = await requireServerSupabaseClient();

  const raw = {
    hebrew_name: formData.get('hebrew_name') as string,
    name: (formData.get('name') as string) || undefined,
    description: (formData.get('description') as string) || null,
    icon: (formData.get('icon') as string) || null,
    parent_id: (formData.get('parent_id') as string) || null,
    sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : undefined,
  };

  const parsed = createCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await supabase
    .from('categories')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidatePath('/[locale]', 'layout');
  return { data: data as Category };
}

// ==================== UPDATE ====================

export async function updateCategory(id: string, formData: FormData) {
  if (!(await isAdmin())) {
    return { error: { _form: ['Unauthorized'] } };
  }
  const supabase = await requireServerSupabaseClient();

  const raw: Record<string, unknown> = {};
  const fields = ['hebrew_name', 'name', 'description', 'icon', 'parent_id', 'sort_order'];

  for (const field of fields) {
    const value = formData.get(field);
    if (value !== null) {
      if (field === 'sort_order') {
        raw[field] = value ? Number(value) : null;
      } else {
        raw[field] = value || null;
      }
    }
  }

  const parsed = updateCategorySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await supabase
    .from('categories')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidatePath('/[locale]', 'layout');
  return { data: data as Category };
}

// ==================== DELETE ====================

export async function deleteCategory(id: string) {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }
  const supabase = await requireServerSupabaseClient();

  // First, unlink all lessons that reference this category
  const { error: unlinkError } = await supabase
    .from('lessons')
    .update({ category_id: null })
    .eq('category_id', id);

  if (unlinkError) {
    return { error: unlinkError.message };
  }

  // Delete the category (DB has ON DELETE CASCADE for children)
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

// ==================== REORDER ====================

export async function reorderCategories(categoryIds: string[]) {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }
  const supabase = await requireServerSupabaseClient();

  // Update sort_order for each category based on its position in the array
  const updates = categoryIds.map((id, index) =>
    supabase
      .from('categories')
      .update({ sort_order: index })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const err = results.find((r) => r.error);
  if (err?.error) return { error: err.error.message };

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}
