import type { SupabaseClient } from '@supabase/supabase-js';
import { SHORT_LESSON_TYPE, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import type { Category, LessonWithRelations } from '@/types/database';
import { LESSON_AUDIO_FILES } from './lesson-selects';

export interface ShortLessons {
  lessons: LessonWithRelations[];
  /** Sub-categories of קצרים, used as topics. */
  topics: Category[];
}

/**
 * Published short lessons (lesson_type short_clip, or filed under קצרים or one
 * of its sub-categories), newest first.
 */
export async function getShortLessons(supabase: SupabaseClient, limit = 500): Promise<ShortLessons> {
  const { data: topics, error: topicsError } = await supabase
    .from('categories')
    .select('*')
    .eq('parent_id', SHORTS_CATEGORY_ID)
    .order('sort_order');
  if (topicsError) throw topicsError;

  const categoryIds = [SHORTS_CATEGORY_ID, ...(topics ?? []).map((t) => t.id)];
  const { data, error } = await supabase
    .from('lessons')
    .select(`*, category:categories(id, hebrew_name, parent_id), ${LESSON_AUDIO_FILES}`)
    .eq('is_published', true)
    .or(`lesson_type.eq.${SHORT_LESSON_TYPE},category_id.in.(${categoryIds.join(',')})`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return { lessons: (data ?? []) as LessonWithRelations[], topics: (topics ?? []) as Category[] };
}
