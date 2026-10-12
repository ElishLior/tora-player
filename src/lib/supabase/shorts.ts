import { withLessonSlugSelect } from './lesson-slug-select';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SHORT_LESSON_TYPE, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import { descendantCategories, descendantIds } from '@/lib/category-tree';
import type { Category, LessonWithRelations } from '@/types/database';
import { getCategoriesTree } from './queries';
import { LESSON_AUDIO_FILES, LESSON_CARD_COLUMNS, LESSON_CATEGORY } from './lesson-selects';

export interface ShortLessons {
  lessons: LessonWithRelations[];
  /** Every category under קצרים (subcategories and their subcategories), in tree order, as topics. */
  topics: Category[];
}

/**
 * Published short lessons (lesson_type short_clip, or filed under קצרים or one
 * of its sub-categories), newest first.
 */
export async function getShortLessons(supabase: SupabaseClient, limit = 500): Promise<ShortLessons> {
  const tree = await getCategoriesTree(supabase);
  const categoryIds = descendantIds(tree, SHORTS_CATEGORY_ID);
  const topics = descendantCategories(tree, SHORTS_CATEGORY_ID).slice(1);

  const { data, error } = await withLessonSlugSelect(`${LESSON_CARD_COLUMNS}, ${LESSON_CATEGORY}, ${LESSON_AUDIO_FILES}`, (columns) => supabase
    .from('lessons')
    .select(columns)
    .eq('is_published', true)
    .or(`lesson_type.eq.${SHORT_LESSON_TYPE},category_id.in.(${categoryIds.join(',')})`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
    .overrideTypes<LessonWithRelations[], { merge: false }>());
  if (error) throw error;

  return { lessons: data ?? [], topics: topics as Category[] };
}
