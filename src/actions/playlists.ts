'use server';

import { revalidatePath } from 'next/cache';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { createPlaylistSchema } from '@/lib/validators';
import type { Playlist } from '@/types/database';

export async function createPlaylist(formData: FormData) {
  const supabase = await requireServerSupabaseClient();

  const raw = {
    name: formData.get('name') as string,
    hebrew_name: formData.get('hebrew_name') as string || undefined,
    description: formData.get('description') as string || undefined,
  };

  const parsed = createPlaylistSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await supabase
    .from('playlists')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidatePath('/[locale]', 'layout');
  return { data: data as Playlist };
}

export async function deletePlaylist(id: string) {
  const supabase = await requireServerSupabaseClient();

  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

export async function addToPlaylist(playlistId: string, lessonId: string) {
  const supabase = await requireServerSupabaseClient();

  // Get the next position
  const { data: existing } = await supabase
    .from('playlist_lessons')
    .select('position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { error } = await supabase
    .from('playlist_lessons')
    .insert({
      playlist_id: playlistId,
      lesson_id: lessonId,
      position: nextPosition,
    });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

export async function removeFromPlaylist(playlistId: string, lessonId: string) {
  const supabase = await requireServerSupabaseClient();

  const { error } = await supabase
    .from('playlist_lessons')
    .delete()
    .eq('playlist_id', playlistId)
    .eq('lesson_id', lessonId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

export async function reorderPlaylistItems(playlistId: string, itemIds: string[]) {
  const supabase = await requireServerSupabaseClient();

  // Update positions based on the new order
  const updates = itemIds.map((id, index) =>
    supabase
      .from('playlist_lessons')
      .update({ position: index })
      .eq('id', id)
      .eq('playlist_id', playlistId)
  );

  const results = await Promise.all(updates);
  const failed = results.find(r => r.error);

  if (failed?.error) {
    return { error: failed.error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}
