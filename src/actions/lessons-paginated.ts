'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { LessonWithRelations } from '@/types/database';

export async function getLessonsPaginated(
  offset: number,
  limit: number,
  audioType?: string
): Promise<{ lessons: LessonWithRelations[]; hasMore: boolean }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { lessons: [], hasMore: false };
  }

  try {
    // If filtering by audio type, get matching lesson IDs first
    let filterLessonIds: string[] | null = null;
    if (audioType) {
      const { data: audioMatches } = await supabase
        .from('lesson_audio')
        .select('lesson_id')
        .eq('audio_type', audioType);
      filterLessonIds = [
        ...new Set((audioMatches || []).map((a: { lesson_id: string }) => a.lesson_id)),
      ];
      // If no lessons match the audio type filter, return empty
      if (filterLessonIds.length === 0) {
        return { lessons: [], hasMore: false };
      }
    }

    let query = supabase
      .from('lessons')
      .select('*, series(name, hebrew_name)')
      .eq('is_published', true)
      .order('date', { ascending: false });

    if (filterLessonIds) {
      query = query.in('id', filterLessonIds);
    }

    // Fetch one extra to determine if there are more
    query = query.range(offset, offset + limit);

    const { data, error } = await query;

    if (error) {
      console.error('getLessonsPaginated error:', error);
      return { lessons: [], hasMore: false };
    }

    const lessons = (data || []) as LessonWithRelations[];
    const hasMore = lessons.length > limit;

    return {
      lessons: hasMore ? lessons.slice(0, limit) : lessons,
      hasMore,
    };
  } catch (err) {
    console.error('getLessonsPaginated error:', err);
    return { lessons: [], hasMore: false };
  }
}
