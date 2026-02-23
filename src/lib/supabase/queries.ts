import { SupabaseClient } from '@supabase/supabase-js';
import type { Lesson, LessonWithRelations, Playlist, PlaylistWithLessons, Series, Bookmark, PlaybackProgress } from '@/types/database';

// ==================== LESSONS ====================

export async function getRecentLessons(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(*)')
    .eq('is_published', true)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as LessonWithRelations[];
}

export async function getLessonById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*, series(*), snippets(*), bookmarks(*), audio_files:lesson_audio(*)')
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
    .select('*, lesson:lessons(id, title, hebrew_title, duration, audio_url, series(name, hebrew_name))')
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
