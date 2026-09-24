'use server';

import { revalidateCatalog } from '@/lib/supabase/anon';
import { AdminRequiredError, requireAdmin } from '@/lib/auth/admin';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { notifyNewLesson, notifyNewLessons } from '@/lib/notifications/notify';
import type { NotifyMode } from '@/lib/notifications/batch-rules';
import { normalizeTags } from '@/lib/tags';
import {
  announceLessonsSchema,
  createLessonSchema,
  lessonTagsSchema,
  uploadLookupCandidatesSchema,
} from '@/lib/validators';
import {
  matchUploadLookup,
  SHORT_LESSON_TYPE,
  SHORTS_CATEGORY_ID,
  type DraftLessonFields,
  type LookupCandidate,
  type LookupLesson,
  type UploadLookup,
} from '@/lib/upload-drafts';

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
 * Check dropped files against the lessons already stored on their dates:
 * files already there are duplicates, and each date's daily lesson is where
 * new parts/images of that date get appended.
 */
export async function lookupUploadTargets(candidates: LookupCandidate[]): Promise<ActionResult<UploadLookup>> {
  const denied = await authorize();
  if (denied) return { error: denied };

  const parsed = uploadLookupCandidatesSchema.safeParse(candidates);
  if (!parsed.success) return { error: 'Invalid upload lookup' };
  if (parsed.data.length === 0) return { data: { duplicates: {}, existingByDate: {} } };

  const dates = [...new Set(parsed.data.map((c) => c.date))];
  const { data, error } = await createAdminSupabaseClient()
    .from('lessons')
    .select(
      'id, title, hebrew_title, date, is_published, lesson_type, category_id, created_at, ' +
        'lesson_audio(file_size, source_filename, sort_order), lesson_images(file_size, source_filename, sort_order)',
    )
    .in('date', dates);
  if (error) return { error: error.message };

  type MediaRow = { file_size: number | string; source_filename: string | null; sort_order: number };
  const media = (rows: MediaRow[] | null) =>
    (rows ?? []).map((m) => ({ size: Number(m.file_size), name: m.source_filename, sortOrder: m.sort_order }));
  const lessons: LookupLesson[] = ((data ?? []) as unknown as Array<{
    id: string;
    title: string;
    hebrew_title: string | null;
    date: string;
    is_published: boolean;
    lesson_type: string | null;
    category_id: string | null;
    created_at: string;
    lesson_audio: MediaRow[] | null;
    lesson_images: MediaRow[] | null;
  }>).map((row) => ({
    id: row.id,
    title: row.hebrew_title || row.title,
    date: row.date,
    isPublished: row.is_published,
    isShort: row.lesson_type === SHORT_LESSON_TYPE || row.category_id === SHORTS_CATEGORY_ID,
    createdAt: row.created_at,
    audio: media(row.lesson_audio),
    images: media(row.lesson_images),
  }));
  return { data: matchUploadLookup(parsed.data, lessons) };
}

/** Add topic tags from an upload draft to the existing lesson it was appended to. */
export async function mergeLessonTags(lessonId: string, tags: string[]): Promise<ActionResult<{ tags: string[] }>> {
  const denied = await authorize();
  if (denied) return { error: denied };

  const parsed = lessonTagsSchema.safeParse(tags);
  if (!parsed.success) return { error: 'Invalid tags' };
  const supabase = createAdminSupabaseClient();
  const { data: lesson, error } = await supabase.from('lessons').select('tags').eq('id', lessonId).maybeSingle();
  if (error) return { error: error.message };
  if (!lesson) return { error: 'Lesson not found' };

  const merged = normalizeTags([...((lesson.tags as string[] | null) ?? []), ...parsed.data]);
  const { error: updateError } = await supabase.from('lessons').update({ tags: merged }).eq('id', lessonId);
  if (updateError) return { error: updateError.message };
  return { data: { tags: merged } };
}

/**
 * Publish a lesson once its uploads are complete. Refuses lessons without
 * audio so listeners never get an empty lesson. `newlyPublished` is false
 * when it was already public. With `notify` (single-lesson callers) the
 * lesson is announced; batch callers announce once via announceUploadedLessons.
 */
export async function publishUploadedLesson(
  lessonId: string,
  notify = true,
): Promise<ActionResult<{ id: string; newlyPublished: boolean }>> {
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

  revalidateCatalog();
  const newlyPublished = (data ?? []).length > 0;
  // Only the call that actually flipped the flag notifies (retries don't re-send).
  if (notify && newlyPublished) await notifyNewLesson(lessonId);
  return { data: { id: lessonId, newlyPublished } };
}

/** Announce the lessons one upload batch published, once, in the admin's chosen mode. */
export async function announceUploadedLessons(lessonIds: string[], mode: NotifyMode): Promise<ActionResult<null>> {
  const denied = await authorize();
  if (denied) return { error: denied };

  const parsed = announceLessonsSchema.safeParse({ lessonIds, mode });
  if (!parsed.success) return { error: 'Invalid announcement' };
  await notifyNewLessons(parsed.data.lessonIds, parsed.data.mode);
  return { data: null };
}
