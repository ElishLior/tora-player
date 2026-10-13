'use server';

import { isAdmin } from '@/lib/auth/admin';
import { deleteFromR2 } from '@/lib/r2';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { revalidateCatalog } from '@/lib/supabase/anon';
import { readLessonSourceRow } from '@/lib/supabase/lesson-sources';
import { isLessonSourceKey, lessonSourceFromRow, type LessonSource } from '@/lib/lesson-sources';

export type LessonSourceActionResult =
  | { ok: true; source: LessonSource | null }
  | { ok: false; error: 'unauthorized' | 'schema_missing' | 'has-file' | 'failed' };

/** The lesson's sources for the admin editor (drafts included). */
export async function getLessonSourceForAdmin(lessonId: string): Promise<LessonSourceActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  const read = await readLessonSourceRow(createAdminSupabaseClient(), lessonId);
  if (!read.ok) return { ok: false, error: read.reason };
  return { ok: true, source: read.row ? lessonSourceFromRow(read.row) : null };
}

/**
 * "יתווספו בהמשך": promise sources that have not arrived (true), or withdraw the
 * promise (false). Never touches a published PDF; remove that first.
 */
export async function setLessonSourceExpected(lessonId: string, expected: boolean): Promise<LessonSourceActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  const supabase = createAdminSupabaseClient();
  const read = await readLessonSourceRow(supabase, lessonId);
  if (!read.ok) return { ok: false, error: read.reason };
  if (read.row?.status === 'ready') return { ok: false, error: 'has-file' };

  const { error } = expected
    ? await supabase
        .from('lesson_sources')
        .upsert({ lesson_id: lessonId, status: 'expected', updated_at: new Date().toISOString() })
    : await supabase.from('lesson_sources').delete().eq('lesson_id', lessonId).eq('status', 'expected');
  if (error) {
    console.error('setLessonSourceExpected failed', error);
    return { ok: false, error: 'failed' };
  }
  revalidateCatalog();
  return getLessonSourceForAdmin(lessonId);
}

/** Remove the lesson's sources: the row first (the page stops linking it), then the file. */
export async function removeLessonSource(lessonId: string): Promise<LessonSourceActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' };
  const supabase = createAdminSupabaseClient();
  const read = await readLessonSourceRow(supabase, lessonId);
  if (!read.ok) return { ok: false, error: read.reason };
  if (!read.row) return { ok: true, source: null };

  const { error } = await supabase.from('lesson_sources').delete().eq('lesson_id', lessonId);
  if (error) {
    console.error('removeLessonSource failed', error);
    return { ok: false, error: 'failed' };
  }
  const key = read.row.file_key;
  if (key && isLessonSourceKey(key)) {
    await deleteFromR2(key).catch((err) => console.error('Sources PDF not deleted from R2:', key, err));
  }
  revalidateCatalog();
  return { ok: true, source: null };
}
