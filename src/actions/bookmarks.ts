'use server';

import { revalidatePath } from 'next/cache';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { createBookmarkSchema } from '@/lib/validators';
import type { Bookmark } from '@/types/database';

export async function createBookmark(data: {
  lesson_id: string;
  position: number;
  note?: string;
}) {
  const supabase = await requireServerSupabaseClient();

  const parsed = createBookmarkSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data: bookmark, error } = await supabase
    .from('bookmarks')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidatePath('/[locale]', 'layout');
  return { data: bookmark as Bookmark };
}

export async function updateBookmark(id: string, updates: { note?: string }) {
  const supabase = await requireServerSupabaseClient();

  const { data, error } = await supabase
    .from('bookmarks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { data: data as Bookmark };
}

export async function deleteBookmark(id: string) {
  const supabase = await requireServerSupabaseClient();

  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}
