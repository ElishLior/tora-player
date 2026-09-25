'use server';

import { revalidateCatalog } from '@/lib/supabase/anon';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createSeriesSchema } from '@/lib/validators';
import { isAdmin } from '@/lib/auth/admin';
import type { Series } from '@/types/database';

export async function createSeries(formData: FormData) {
  if (!(await isAdmin())) {
    return { error: { _form: ['Unauthorized'] } };
  }
  const supabase = createAdminSupabaseClient();

  const raw = {
    name: formData.get('name') as string,
    hebrew_name: formData.get('hebrew_name') as string || undefined,
    description: formData.get('description') as string || undefined,
  };

  const parsed = createSeriesSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await supabase
    .from('series')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidateCatalog();
  return { data: data as Series };
}

export async function updateSeries(id: string, formData: FormData) {
  if (!(await isAdmin())) {
    return { error: { _form: ['Unauthorized'] } };
  }
  const supabase = createAdminSupabaseClient();

  const raw: Record<string, unknown> = {};
  for (const field of ['name', 'hebrew_name', 'description']) {
    const value = formData.get(field);
    if (value !== null) {
      raw[field] = value || null;
    }
  }

  const { data, error } = await supabase
    .from('series')
    .update(raw)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidateCatalog();
  return { data: data as Series };
}

export async function deleteSeries(id: string) {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase
    .from('series')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidateCatalog();
  return { success: true };
}
