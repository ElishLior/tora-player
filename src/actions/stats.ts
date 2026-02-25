'use server';

import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/actions/auth';

export interface OverviewStats {
  totalLessons: number;
  totalAudioFiles: number;
  totalImages: number;
  totalSeries: number;
  totalBookmarks: number;
  totalListeningHours: number;
}

export interface PopularLesson {
  lessonId: string;
  title: string;
  hebrewTitle: string | null;
  listenCount: number;
}

export interface DailyActivity {
  date: string;
  count: number;
}

export interface CompletionStats {
  totalCompleted: number;
  totalProgress: number;
  completionRate: number;
}

export async function getOverviewStats(): Promise<{ data?: OverviewStats; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }

  const supabase = await requireServerSupabaseClient();

  const [
    lessonsResult,
    audioResult,
    imagesResult,
    seriesResult,
    bookmarksResult,
    progressResult,
  ] = await Promise.all([
    supabase.from('lessons').select('id', { count: 'exact', head: true }),
    supabase.from('lesson_audio').select('id', { count: 'exact', head: true }),
    supabase.from('lesson_images').select('id', { count: 'exact', head: true }),
    supabase.from('series').select('id', { count: 'exact', head: true }),
    supabase.from('bookmarks').select('id', { count: 'exact', head: true }),
    supabase.from('playback_progress').select('position'),
  ]);

  const totalListeningSeconds = (progressResult.data || []).reduce(
    (sum, row) => sum + (row.position || 0),
    0
  );

  return {
    data: {
      totalLessons: lessonsResult.count || 0,
      totalAudioFiles: audioResult.count || 0,
      totalImages: imagesResult.count || 0,
      totalSeries: seriesResult.count || 0,
      totalBookmarks: bookmarksResult.count || 0,
      totalListeningHours: Math.round((totalListeningSeconds / 3600) * 10) / 10,
    },
  };
}

export async function getPopularLessons(
  limit: number = 10
): Promise<{ data?: PopularLesson[]; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }

  const supabase = await requireServerSupabaseClient();

  // Get all playback progress records with lesson info
  const { data: progressData, error } = await supabase
    .from('playback_progress')
    .select('lesson_id, lessons(title, hebrew_title)');

  if (error) {
    return { error: error.message };
  }

  if (!progressData || progressData.length === 0) {
    return { data: [] };
  }

  // Group by lesson_id and count
  const lessonCounts = new Map<string, { title: string; hebrewTitle: string | null; count: number }>();

  for (const row of progressData) {
    const existing = lessonCounts.get(row.lesson_id);
    const lessonData = row.lessons as unknown as { title: string; hebrew_title: string | null } | null;
    if (existing) {
      existing.count += 1;
    } else {
      lessonCounts.set(row.lesson_id, {
        title: lessonData?.title || 'Unknown',
        hebrewTitle: lessonData?.hebrew_title || null,
        count: 1,
      });
    }
  }

  // Sort by count descending and limit
  const sorted = Array.from(lessonCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([lessonId, info]) => ({
      lessonId,
      title: info.title,
      hebrewTitle: info.hebrewTitle,
      listenCount: info.count,
    }));

  return { data: sorted };
}

export async function getRecentActivity(
  days: number = 14
): Promise<{ data?: DailyActivity[]; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }

  const supabase = await requireServerSupabaseClient();

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const sinceDateStr = sinceDate.toISOString();

  const { data, error } = await supabase
    .from('playback_progress')
    .select('lesson_id, updated_at')
    .gte('updated_at', sinceDateStr);

  if (error) {
    return { error: error.message };
  }

  // Group by date
  const dateCounts = new Map<string, Set<string>>();

  for (const row of data || []) {
    const date = row.updated_at?.split('T')[0];
    if (!date) continue;
    if (!dateCounts.has(date)) {
      dateCounts.set(date, new Set());
    }
    dateCounts.get(date)!.add(row.lesson_id);
  }

  // Fill in all dates in range
  const result: DailyActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    result.push({
      date: dateStr,
      count: dateCounts.get(dateStr)?.size || 0,
    });
  }

  return { data: result };
}

export async function getCompletionStats(): Promise<{ data?: CompletionStats; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }

  const supabase = await requireServerSupabaseClient();

  const [totalResult, completedResult] = await Promise.all([
    supabase.from('playback_progress').select('id', { count: 'exact', head: true }),
    supabase
      .from('playback_progress')
      .select('id', { count: 'exact', head: true })
      .eq('completed', true),
  ]);

  const total = totalResult.count || 0;
  const completed = completedResult.count || 0;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    data: {
      totalCompleted: completed,
      totalProgress: total,
      completionRate: rate,
    },
  };
}
