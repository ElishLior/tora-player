'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  createSupabaseLessonListReader,
  loadPaginatedLessonList,
  type LessonListFailureCode,
} from '@/lib/supabase/lesson-list';
import type { LessonWithRelations } from '@/types/database';

export async function getLessonsPaginated(
  offset: number,
  limit: number,
  audioType?: string,
  categoryId?: string
): Promise<{
  lessons: LessonWithRelations[];
  hasMore: boolean;
  error?: { code: LessonListFailureCode; message: string };
}> {
  const supabase = await createServerSupabaseClient();
  const result = await loadPaginatedLessonList(
    supabase ? createSupabaseLessonListReader(supabase) : null,
    {
      offset,
      limit,
      audioTypeFilter: audioType,
      categoryFilter: categoryId,
    },
  );

  if (!result.ok) {
    console.error('getLessonsPaginated error:', {
      code: result.code,
      message: result.message,
    });
    return {
      lessons: [],
      hasMore: false,
      error: {
        code: result.code,
        message: result.message,
      },
    };
  }

  return {
    lessons: result.lessons,
    hasMore: result.hasMore,
  };
}
