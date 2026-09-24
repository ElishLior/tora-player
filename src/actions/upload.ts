'use server';

import { revalidatePath } from 'next/cache';
import { AdminRequiredError, requireAdmin } from '@/lib/auth/admin';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { notifyNewLesson } from '@/lib/notifications/notify';
import { createLessonSchema, duplicateAudioCandidatesSchema } from '@/lib/validators';
import type { DraftLessonFields } from '@/lib/upload-drafts';

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

async function authorize(): Promise<string | null> {
  try {
    await requireAdmin();
    return null;
  } catch (error) {
    if (error instanceof AdminRequiredError) return 'Unauthorized';
    throw error;
  }
}

/**
 * Create the lesson row for an upload draft. It stays unpublished (hidden from
 * listeners) until publishUploadedLesson confirms every file landed.
 */
export async function createDraftLesson(fields: DraftLessonFields): Promise<ActionResult<{ id: string }>> {
  const denied = await authorize();
  if (denied) return { error: denied };

  const parsed = createLessonSchema.safeParse({ ...fields, source_type: 'upload' });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }

  const { data, error } = await createAdminSupabaseClient()
    .from('lessons')
    .insert({ ...parsed.data, is_published: false })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { data: { id: data.id as string } };
}

/**
 * Find dropped audio files that already exist on a lesson of the same date
 * (same byte size or same original filename). Returns fileId → lesson title.
 */
export async function findDuplicateAudio(
  candidates: Array<{ fileId: string; date: string; size: number; name: string }>,
): Promise<ActionResult<Record<string, string>>> {
  const denied = await authorize();
  if (denied) return { error: denied };

  const parsed = duplicateAudioCandidatesSchema.safeParse(candidates);
  if (!parsed.success) return { error: 'Invalid duplicate check' };
  if (parsed.data.length === 0) return { data: {} };

  const dates = [...new Set(parsed.data.map((c) => c.date))];
  const { data, error } = await createAdminSupabaseClient()
    .from('lesson_audio')
    .select('file_size, source_filename, lessons!inner(title, date)')
    .in('lessons.date', dates);
  if (error) return { error: error.message };

  const existing = (data ?? []).flatMap((row) => {
    const lessons = Array.isArray(row.lessons) ? row.lessons : [row.lessons];
    return lessons.map((lesson: { title: string; date: string }) => ({
      size: Number(row.file_size),
      name: row.source_filename as string | null,
      title: lesson.title,
      date: lesson.date,
    }));
  });

  const duplicates: Record<string, string> = {};
  for (const candidate of parsed.data) {
    const match = existing.find(
      (e) => e.date === candidate.date && (e.size === candidate.size || e.name === candidate.name),
    );
    if (match) duplicates[candidate.fileId] = match.title;
  }
  return { data: duplicates };
}

/**
 * Publish a lesson once its uploads are complete and tell subscribers.
 * Refuses lessons without audio so listeners never get an empty lesson.
 */
export async function publishUploadedLesson(lessonId: string): Promise<ActionResult<{ id: string }>> {
  const denied = await authorize();
  if (denied) return { error: denied };

  const supabase = createAdminSupabaseClient();
  const { count, error: countError } = await supabase
    .from('lesson_audio')
    .select('id', { count: 'exact', head: true })
    .eq('lesson_id', lessonId);
  if (countError) return { error: countError.message };
  if (!count) return { error: 'No audio uploaded for this lesson' };

  const { data, error } = await supabase
    .from('lessons')
    .update({ is_published: true })
    .eq('id', lessonId)
    .eq('is_published', false)
    .select('id');
  if (error) return { error: error.message };

  revalidatePath('/[locale]', 'layout');
  // Only the call that actually flipped the flag notifies (retries don't re-send).
  if (data && data.length > 0) await notifyNewLesson(lessonId);
  return { data: { id: lessonId } };
}
