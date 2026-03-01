import { SupabaseClient } from '@supabase/supabase-js';
import type { Lesson, LessonWithRelations, Playlist, PlaylistWithLessons, Series, Bookmark, PlaybackProgress, Category, CategoryWithChildren } from '@/types/database';

// ==================== LESSONS ====================

export async function getRecentLessons(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(*), category:categories(id, hebrew_name)')
    .eq('is_published', true)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as LessonWithRelations[];
}

export async function getLessonById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(*), category:categories(id, hebrew_name), snippets(*), bookmarks(*), audio_files:lesson_audio(*), images:lesson_images(*)')
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

  // Get playback progress
  const { data: progress } = await supabase
    .from('playback_progress')
    .select('*')
    .eq('lesson_id', id)
    .single();
  data.progress = progress;

  return data as LessonWithRelations;
}

export async function getLessonsByDate(supabase: SupabaseClient, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(name, hebrew_name)')
    .eq('is_published', true)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (error) throw error;
  return data as LessonWithRelations[];
}

export async function getLessonsBySeries(supabase: SupabaseClient, seriesId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('series_id', seriesId)
    .eq('is_published', true)
    .order('date', { ascending: false });

  if (error) throw error;
  return data as Lesson[];
}

export async function searchLessons(supabase: SupabaseClient, query: string) {
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(name, hebrew_name)')
    .eq('is_published', true)
    .or(`title.ilike.%${escaped}%,hebrew_title.ilike.%${escaped}%,description.ilike.%${escaped}%`)
    .order('date', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data as LessonWithRelations[];
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
    .select('*, series(name, hebrew_name), category:categories(id, hebrew_name)')
    .eq('is_published', true)
    .in('category_id', categoryIds)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as LessonWithRelations[];
}

export async function getCategoryLessonCounts(supabase: SupabaseClient) {
  // Get count of published lessons per category
  const { data, error } = await supabase
    .from('lessons')
    .select('category_id')
    .eq('is_published', true)
    .not('category_id', 'is', null);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.category_id] = (counts[row.category_id] || 0) + 1;
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
    .select('*, playlist_lessons(*, lesson:lessons(*))')
    .eq('id', playlistId)
    .single();

  if (error) throw error;

  // Sort items by position
  if (data.playlist_lessons) {
    data.playlist_lessons.sort((a: { position: number }, b: { position: number }) => a.position - b.position);
  }

  return data as PlaylistWithLessons;
}

// ==================== BOOKMARKS ====================

export async function getBookmarksByLesson(supabase: SupabaseClient, lessonId: string) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: true });

  if (error) throw error;
  return data as Bookmark[];
}

export async function getAllBookmarks(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*, lesson:lessons(id, title, hebrew_title)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Bookmark[];
}

// ==================== PLAYBACK PROGRESS ====================

export async function getPlaybackProgress(supabase: SupabaseClient, lessonId: string) {
  const { data } = await supabase
    .from('playback_progress')
    .select('*')
    .eq('lesson_id', lessonId)
    .single();

  return data as PlaybackProgress | null;
}

export async function getRecentProgress(supabase: SupabaseClient, limit = 10) {
  const { data, error } = await supabase
    .from('playback_progress')
    .select('*, lesson:lessons(id, title, hebrew_title, date, duration, audio_url, series(name, hebrew_name))')
    .eq('completed', false)
    .order('last_played_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as (PlaybackProgress & { lesson: LessonWithRelations })[];
}

export async function upsertPlaybackProgress(
  supabase: SupabaseClient,
  lessonId: string,
  position: number,
  completed = false
) {
  const { data, error } = await supabase
    .from('playback_progress')
    .upsert(
      {
        lesson_id: lessonId,
        position,
        completed,
        last_played_at: new Date().toISOString(),
      },
      { onConflict: 'lesson_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as PlaybackProgress;
}
