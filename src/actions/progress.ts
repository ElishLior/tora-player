'use server';

import { filterVisibleIds, getSignedInClient } from '@/lib/account/server';
import { pickProgressToUpload, type ServerProgress } from '@/lib/account/merge';
import { progressSyncSchema } from '@/lib/validators';

/**
 * Uploads device progress entries that are newer than the account's copy
 * (last-played wins) and returns the account's progress for every lesson.
 * Live updates while listening go through PUT /api/progress.
 */
export async function syncProgress(
  entries: ServerProgress[],
): Promise<{ data: ServerProgress[] } | { error: string }> {
  const parsed = progressSyncSchema.safeParse(entries);
  if (!parsed.success) return { error: 'invalid_progress' };

  const session = await getSignedInClient();
  if (!session) return { error: 'auth_required' };
  const { supabase, userId } = session;

  try {
    const { data: existing, error: readError } = await supabase
      .from('playback_progress')
      .select('lesson_id, position, completed, last_played_at');
    if (readError) throw new Error(readError.message);

    const newer = pickProgressToUpload(
      parsed.data.map((row) => ({
        lessonId: row.lesson_id,
        position: row.position,
        completed: row.completed,
        lastPlayed: row.last_played_at,
      })),
      existing ?? [],
    );

    if (newer.length > 0) {
      const lessonIds = await filterVisibleIds(supabase, 'lessons', newer.map((entry) => entry.lessonId));
      const rows = newer
        .filter((entry) => lessonIds.has(entry.lessonId))
        .map((entry) => ({
          user_id: userId,
          lesson_id: entry.lessonId,
          position: Math.round(entry.position),
          completed: entry.completed,
          last_played_at: entry.lastPlayed,
        }));
      if (rows.length > 0) {
        const { error } = await supabase
          .from('playback_progress')
          .upsert(rows, { onConflict: 'user_id,lesson_id' });
        if (error) throw new Error(error.message);
      }
    }

    const { data, error } = await supabase
      .from('playback_progress')
      .select('lesson_id, position, completed, last_played_at');
    if (error) throw new Error(error.message);
    return { data: data ?? [] };
  } catch (err) {
    console.error('[progress] sync failed:', err);
    return { error: err instanceof Error ? err.message : 'sync_failed' };
  }
}
