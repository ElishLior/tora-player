'use server';

import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { playbackProgressSchema } from '@/lib/validators';
import type { PlaybackProgress } from '@/types/database';

export async function updateProgress(data: {
  lesson_id: string;
  position: number;
  completed?: boolean;
}) {
  const supabase = await requireServerSupabaseClient();

  const parsed = playbackProgressSchema.safeParse({
    ...data,
    completed: data.completed ?? false,
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data: progress, error } = await supabase
    .from('playback_progress')
    .upsert(
      {
        lesson_id: parsed.data.lesson_id,
        position: parsed.data.position,
        completed: parsed.data.completed,
        last_played_at: new Date().toISOString(),
      },
      { onConflict: 'lesson_id' }
    )
    .select()
    .single();

  if (error) {
    return { error: { _form: [error.message] } };
  }

  return { data: progress as PlaybackProgress };
}

export async function markAsCompleted(lessonId: string) {
  const supabase = await requireServerSupabaseClient();

  const { error } = await supabase
    .from('playback_progress')
    .upsert(
      {
        lesson_id: lessonId,
        completed: true,
        last_played_at: new Date().toISOString(),
      },
      { onConflict: 'lesson_id' }
    );

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
