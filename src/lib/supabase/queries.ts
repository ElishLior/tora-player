import { withLessonSlugSelect } from './lesson-slug-select';
import { SupabaseClient } from '@supabase/supabase-js';
import type { LessonWithRelations, Playlist, PlaylistWithLessons, Series, Category, CategoryWithChildren } from '@/types/database';
import { LESSON_AUDIO_FILES, LESSON_CARD_COLUMNS, LESSON_CATEGORY } from './lesson-selects';
import { buildCategoryTree, descendantIds } from '@/lib/category-tree';

// ==================== LESSONS ====================

/** Latest published daily lessons; short lessons have their own section (lib/supabase/shorts). */
export async function getRecentLessons(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await withLessonSlugSelect(`${LESSON_CARD_COLUMNS}, series(id, name, hebrew_name), ${LESSON_CATEGORY}, ${LESSON_AUDIO_FILES}`, (columns) => supabase
    .from('lessons')
    .select(columns)
    .eq('is_published', true)
    .or('lesson_type.is.null,lesson_type.neq.short_clip')
    .order('date', { ascending: false })
    .limit(limit)
    .overrideTypes<LessonWithRelations[], { merge: false }>());

  if (error) throw error;
  return data;
}

export async function getLessonById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(*), category:categories(id, hebrew_name, name), snippets(*), audio_files:lesson_audio(*), images:lesson_images(*)')
    .eq('id', id)
    .single();

  if (error) throw error;

  // Get linked parts if this is a multi-part lesson
  if (data.parent_lesson_id || data.part_number) {
    const parentId = data.parent_lesson_id || data.id;
    const { data: parts } = await supabase
      .from('lessons')
      .select('*')
      .or(`id.eq.${parentId},parent_lesson_id.eq.${parentId}`)
      .order('part_number', { ascending: true });
    data.parts = parts || [];
  }

  return data as LessonWithRelations;
}

export async function getLessonsBySeries(supabase: SupabaseClient, seriesId: string) {
  const { data, error } = await withLessonSlugSelect(`${LESSON_CARD_COLUMNS}, ${LESSON_AUDIO_FILES}`, (columns) => supabase
    .from('lessons')
    .select(columns)
    .eq('series_id', seriesId)
    .eq('is_published', true)
    .order('date', { ascending: false })
    .overrideTypes<LessonWithRelations[], { merge: false }>());

  if (error) throw error;
  return data;
}

// ==================== CATEGORIES ====================

export async function getAllCategories(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  if (error) throw error;
  return data as Category[];
}

/** Every category as a tree of up to three levels (src/lib/category-tree.ts). */
export async function getCategoriesTree(supabase: SupabaseClient): Promise<CategoryWithChildren[]> {
  return buildCategoryTree(await getAllCategories(supabase));
}

export async function getCategoryById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Category;
}

/**
 * Published lessons filed under the category or any of its subcategories (up to
 * three levels). A lesson has one category_id, so no lesson appears twice.
 */
export async function getLessonsByCategory(supabase: SupabaseClient, categoryId: string, limit = 50) {
  const categoryIds = descendantIds(await getCategoriesTree(supabase), categoryId);

  const { data, error } = await withLessonSlugSelect(`${LESSON_CARD_COLUMNS}, series(id, name, hebrew_name), ${LESSON_CATEGORY}, ${LESSON_AUDIO_FILES}`, (columns) => supabase
    .from('lessons')
    .select(columns)
    .eq('is_published', true)
    .in('category_id', categoryIds)
    // Same order as the category's continuous-play queue (src/lib/category-queue.ts).
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
    .overrideTypes<LessonWithRelations[], { merge: false }>());

  if (error) throw error;
  return data;
}

/** Published lessons per category id, counted in SQL by `category_lesson_counts()` (migration 018). */
export async function getCategoryLessonCounts(supabase: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('category_lesson_counts');
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { category_id: string; lesson_count: number | string }[]) {
    counts[row.category_id] = Number(row.lesson_count);
  }
  return counts;
}

// ==================== SERIES ====================

export async function getAllSeries(supabase: SupabaseClient) {
  // `lessons(count)`: the series' lessons the client can see (published only, for the anon client); one FK (lessons.series_id).
  const { data, error } = await supabase
    .from('series')
    .select('*, lessons(count)')
    .order('name');

  if (error) throw error;
  return data as Series[];
}

export async function getSeriesById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('series')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Series;
}

// ==================== PLAYLISTS ====================

export async function getAllPlaylists(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('playlists')
    .select('*, playlist_lessons(count)')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data as Playlist[];
}

export async function getPlaylistWithLessons(supabase: SupabaseClient, playlistId: string) {
  const { data, error } = await withLessonSlugSelect(`*, playlist_lessons(*, lesson:lessons(${LESSON_CARD_COLUMNS}, ${LESSON_AUDIO_FILES}))`, (columns) => supabase
    .from('playlists')
    .select(columns)
    .eq('id', playlistId)
    .single().overrideTypes<PlaylistWithLessons & { playlist_lessons?: Array<{ position: number }> }, { merge: false }>());

  if (error) throw error;

  // Sort items by position
  if (data.playlist_lessons) {
    data.playlist_lessons.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
  }

  return data as PlaylistWithLessons;
}
