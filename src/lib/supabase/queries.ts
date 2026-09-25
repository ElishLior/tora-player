import { SupabaseClient } from '@supabase/supabase-js';
import type { LessonWithRelations, Playlist, PlaylistWithLessons, Series, Category, CategoryWithChildren } from '@/types/database';
import { LESSON_AUDIO_FILES, LESSON_CARD_COLUMNS } from './lesson-selects';

// ==================== LESSONS ====================

/** Latest published daily lessons; short lessons have their own section (lib/supabase/shorts). */
export async function getRecentLessons(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await supabase
    .from('lessons')
    .select(`${LESSON_CARD_COLUMNS}, series(name, hebrew_name), category:categories(id, hebrew_name), ${LESSON_AUDIO_FILES}`)
    .eq('is_published', true)
    .or('lesson_type.is.null,lesson_type.neq.short_clip')
    .order('date', { ascending: false })
    .limit(limit)
    .overrideTypes<LessonWithRelations[], { merge: false }>();

  if (error) throw error;
  return data;
}

export async function getLessonById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(*), category:categories(id, hebrew_name), snippets(*), audio_files:lesson_audio(*), images:lesson_images(*)')
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
  const { data, error } = await supabase
    .from('lessons')
    .select(`${LESSON_CARD_COLUMNS}, ${LESSON_AUDIO_FILES}`)
    .eq('series_id', seriesId)
    .eq('is_published', true)
    .order('date', { ascending: false })
    .overrideTypes<LessonWithRelations[], { merge: false }>();

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

export async function getCategoriesTree(supabase: SupabaseClient): Promise<CategoryWithChildren[]> {
  const all = await getAllCategories(supabase);

  // Build tree: top-level categories with children nested
  const topLevel = all.filter(c => !c.parent_id);
  return topLevel.map(parent => ({
    ...parent,
    children: all.filter(c => c.parent_id === parent.id).sort((a, b) => a.sort_order - b.sort_order),
  }));
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

export async function getLessonsByCategory(supabase: SupabaseClient, categoryId: string, limit = 50) {
  // Get this category's children (if any) to include sub-category lessons too
  const { data: children } = await supabase
    .from('categories')
    .select('id')
    .eq('parent_id', categoryId);

  const categoryIds = [categoryId, ...(children || []).map(c => c.id)];

  const { data, error } = await supabase
    .from('lessons')
    .select(`${LESSON_CARD_COLUMNS}, series(name, hebrew_name), category:categories(id, hebrew_name), ${LESSON_AUDIO_FILES}`)
    .eq('is_published', true)
    .in('category_id', categoryIds)
    .order('date', { ascending: false })
    .limit(limit)
    .overrideTypes<LessonWithRelations[], { merge: false }>();

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
  const { data, error } = await supabase
    .from('series')
    .select('*')
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
  const { data, error } = await supabase
    .from('playlists')
    .select(`*, playlist_lessons(*, lesson:lessons(${LESSON_CARD_COLUMNS}, ${LESSON_AUDIO_FILES}))`)
    .eq('id', playlistId)
    .single();

  if (error) throw error;

  // Sort items by position
  if (data.playlist_lessons) {
    data.playlist_lessons.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
  }

  return data as PlaylistWithLessons;
}
