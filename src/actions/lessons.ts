'use server';

import { revalidatePath } from 'next/cache';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { createLessonSchema, updateLessonSchema } from '@/lib/validators';
import type { Lesson, LessonWithRelations, LessonAudio, LessonImage } from '@/types/database';

export async function createLesson(formData: FormData) {
  const supabase = await requireServerSupabaseClient();

  const raw = {
    title: formData.get('title') as string,
    hebrew_title: formData.get('hebrew_title') as string || undefined,
    description: formData.get('description') as string || undefined,
    date: formData.get('date') as string,
    series_id: formData.get('series_id') as string || undefined,
    part_number: formData.get('part_number') ? Number(formData.get('part_number')) : undefined,
    parent_lesson_id: formData.get('parent_lesson_id') as string || undefined,
    source_text: formData.get('source_text') as string || undefined,
    source_type: (formData.get('source_type') as string) || 'upload',
  };

  const parsed = createLessonSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await supabase
    .from('lessons')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidatePath('/[locale]', 'layout');
  return { data: data as Lesson };
}

export async function updateLesson(id: string, formData: FormData) {
  const supabase = await requireServerSupabaseClient();

  const raw: Record<string, unknown> = {};
  const fields = ['title', 'hebrew_title', 'description', 'date', 'series_id', 'part_number', 'parent_lesson_id', 'is_published'];

  for (const field of fields) {
    const value = formData.get(field);
    if (value !== null) {
      if (field === 'part_number') {
        raw[field] = value ? Number(value) : null;
      } else if (field === 'is_published') {
        raw[field] = value === 'true';
      } else {
        raw[field] = value || null;
      }
    }
  }

  const parsed = updateLessonSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await supabase
    .from('lessons')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidatePath('/[locale]', 'layout');
  return { data: data as Lesson };
}

export async function deleteLesson(id: string) {
  const supabase = await requireServerSupabaseClient();

  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

export async function publishLesson(id: string, publish: boolean) {
  const supabase = await requireServerSupabaseClient();

  const { error } = await supabase
    .from('lessons')
    .update({ is_published: publish })
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

export async function getLesson(id: string) {
  const supabase = await requireServerSupabaseClient();

  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(*), snippets(*), bookmarks(*), audio_files:lesson_audio(*), images:lesson_images(*)')
    .eq('id', id)
    .single();

  if (error) {
    return { error: error.message };
  }

  // Get linked parts
  if (data.parent_lesson_id || data.part_number) {
    const parentId = data.parent_lesson_id || data.id;
    const { data: parts } = await supabase
      .from('lessons')
      .select('*')
      .or(`id.eq.${parentId},parent_lesson_id.eq.${parentId}`)
      .order('part_number', { ascending: true });
    data.parts = parts || [];
  }

  // Get playback progress
  const { data: progress } = await supabase
    .from('playback_progress')
    .select('*')
    .eq('lesson_id', id)
    .single();
  data.progress = progress;

  return { data: data as LessonWithRelations };
}

// --- Audio file management ---

export async function getAudioFiles(lessonId: string) {
  const supabase = await requireServerSupabaseClient();

  const { data, error } = await supabase
    .from('lesson_audio')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('sort_order', { ascending: true });

  if (error) return { error: error.message };
  return { data: data as LessonAudio[] };
}

export async function renameAudioFile(fileId: string, newName: string) {
  const supabase = await requireServerSupabaseClient();

  const { error } = await supabase
    .from('lesson_audio')
    .update({ original_name: newName })
    .eq('id', fileId);

  if (error) return { error: error.message };
  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

export async function reorderAudioFiles(lessonId: string, fileIds: string[]) {
  const supabase = await requireServerSupabaseClient();

  // Update sort_order for each file based on its position in the array
  const updates = fileIds.map((id, index) =>
    supabase
      .from('lesson_audio')
      .update({ sort_order: index })
      .eq('id', id)
      .eq('lesson_id', lessonId)
  );

  const results = await Promise.all(updates);
  const err = results.find((r) => r.error);
  if (err?.error) return { error: err.error.message };

  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

export async function deleteAudioFile(fileId: string) {
  const supabase = await requireServerSupabaseClient();

  const { error } = await supabase
    .from('lesson_audio')
    .delete()
    .eq('id', fileId);

  if (error) return { error: error.message };
  revalidatePath('/[locale]', 'layout');
  return { success: true };
}

export async function searchLessons(query: string) {
  const supabase = await requireServerSupabaseClient();

  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(name, hebrew_name)')
    .eq('is_published', true)
    .or(`title.ilike.%${query}%,hebrew_title.ilike.%${query}%,description.ilike.%${query}%`)
    .order('date', { ascending: false })
    .limit(50);

  if (error) {
    return { error: error.message };
  }

  return { data: data as LessonWithRelations[] };
}
