import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LESSON_SOURCE_COLUMNS,
  isMissingLessonSources,
  type LessonSourceRow,
} from '@/lib/lesson-sources';

export type LessonSourceRead =
  | { ok: true; row: LessonSourceRow | null }
  | { ok: false; reason: 'schema_missing' | 'failed' };

/**
 * The lesson's sources row, or null when it has none. Through `lessonReadClient()`
 * a visitor sees it only for a published lesson (RLS); the service role sees all.
 * Never throws.
 */
export async function readLessonSourceRow(supabase: SupabaseClient, lessonId: string): Promise<LessonSourceRead> {
  try {
    const { data, error } = await supabase
      .from('lesson_sources')
      .select(LESSON_SOURCE_COLUMNS)
      .eq('lesson_id', lessonId)
      .maybeSingle();
    if (error) {
      if (isMissingLessonSources(error)) return { ok: false, reason: 'schema_missing' };
      console.error('lesson_sources read failed', error);
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, row: (data as LessonSourceRow | null) ?? null };
  } catch (error) {
    console.error('lesson_sources read failed', error);
    return { ok: false, reason: 'failed' };
  }
}
