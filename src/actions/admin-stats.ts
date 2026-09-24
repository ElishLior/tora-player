'use server';

import { requireAdmin } from '@/lib/auth/admin';
import { fillDailySeries, parseStatsPeriod, toStatsDay, type StatsPeriod } from '@/lib/admin-insights';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const TOP_LESSONS_LIMIT = 10;
const RECENT_SIGNUPS_LIMIT = 10;

export interface DailyListens {
  day: string;
  listens: number;
  listeners: number;
  listenedSeconds: number;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface TopLesson {
  lessonId: string;
  title: string;
  hebrewTitle: string | null;
  listens: number;
  listeners: number;
  listenedSeconds: number;
}

export interface RecentSignup {
  userId: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
}

export interface AdminStats {
  days: StatsPeriod;
  listens: { total: number; listeners: number; signedInListeners: number; listenedSeconds: number };
  activeListeners: { day: number; week: number; month: number };
  audience: { usersTotal: number; usersNew: number; pushTotal: number; pushNew: number; emailOptIn: number };
  content: {
    lessons: number;
    publishedLessons: number;
    audioFiles: number;
    images: number;
    series: number;
    bookmarks: number;
  };
  /** Per-user playback_progress rows of signed-in listeners. */
  completion: { tracked: number; completed: number };
  listensPerDay: DailyListens[];
  signupsPerDay: DailyCount[];
  pushPerDay: DailyCount[];
  topByListens: TopLesson[];
  topByMinutes: TopLesson[];
  recentSignups: RecentSignup[];
}

interface TopLessonRow {
  lesson_id: string;
  title: string;
  hebrew_title: string | null;
  listens: number;
  listeners: number;
  listened_seconds: number;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${label}: no data`);
  return result.data;
}

function unwrapCount(result: { count: number | null; error: { message: string } | null }, label: string): number {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.count ?? 0;
}

function toTopLesson(row: TopLessonRow): TopLesson {
  return {
    lessonId: row.lesson_id,
    title: row.title,
    hebrewTitle: row.hebrew_title,
    listens: Number(row.listens),
    listeners: Number(row.listeners),
    listenedSeconds: Number(row.listened_seconds),
  };
}

/** Admin only: everything /admin/stats shows, for the last `days` days (Israel time). */
export async function getAdminStats(period: number | string): Promise<AdminStats> {
  await requireAdmin();
  const days = parseStatsPeriod(String(period));
  const supabase = createAdminSupabaseClient();
  const head = { count: 'exact' as const, head: true };

  const [
    listensPerDay,
    listenTotals,
    active,
    audience,
    signupsPerDay,
    pushPerDay,
    topByListens,
    topByMinutes,
    recentSignups,
    lessons,
    publishedLessons,
    audioFiles,
    images,
    series,
    bookmarks,
    tracked,
    completed,
  ] = await Promise.all([
    supabase.rpc('admin_listens_per_day', { p_days: days }),
    supabase.rpc('admin_listen_totals', { p_days: days }).single(),
    supabase.rpc('admin_active_listeners').single(),
    supabase.rpc('admin_audience_totals', { p_days: days }).single(),
    supabase.rpc('admin_signups_per_day', { p_days: days }),
    supabase.rpc('admin_push_subscribers_per_day', { p_days: days }),
    supabase.rpc('admin_top_lessons', { p_days: days, p_order: 'listens', p_limit: TOP_LESSONS_LIMIT }),
    supabase.rpc('admin_top_lessons', { p_days: days, p_order: 'minutes', p_limit: TOP_LESSONS_LIMIT }),
    supabase.rpc('admin_recent_signups', { p_limit: RECENT_SIGNUPS_LIMIT }),
    supabase.from('lessons').select('id', head),
    supabase.from('lessons').select('id', head).eq('is_published', true),
    supabase.from('lesson_audio').select('id', head),
    supabase.from('lesson_images').select('id', head),
    supabase.from('series').select('id', head),
    supabase.from('bookmarks').select('id', head),
    supabase.from('playback_progress').select('id', head),
    supabase.from('playback_progress').select('id', head).eq('completed', true),
  ]);

  const today = toStatsDay(new Date());
  const totals = unwrap(listenTotals, 'listen totals') as {
    listens: number;
    listeners: number;
    signed_in_listeners: number;
    listened_seconds: number;
  };
  const activeRow = unwrap(active, 'active listeners') as {
    last_1_day: number;
    last_7_days: number;
    last_30_days: number;
  };
  const audienceRow = unwrap(audience, 'audience') as {
    users_total: number;
    users_new: number;
    push_subscribers_total: number;
    push_subscribers_new: number;
    email_opt_in: number;
  };

  const perDay = unwrap(listensPerDay, 'listens per day') as {
    day: string;
    listens: number;
    listeners: number;
    listened_seconds: number;
  }[];
  const signups = unwrap(signupsPerDay, 'signups per day') as { day: string; signups: number }[];
  const push = unwrap(pushPerDay, 'push per day') as { day: string; subscribers: number }[];
  const emptyCount = (day: string): DailyCount => ({ day, count: 0 });

  return {
    days,
    listens: {
      total: Number(totals.listens),
      listeners: Number(totals.listeners),
      signedInListeners: Number(totals.signed_in_listeners),
      listenedSeconds: Number(totals.listened_seconds),
    },
    activeListeners: {
      day: Number(activeRow.last_1_day),
      week: Number(activeRow.last_7_days),
      month: Number(activeRow.last_30_days),
    },
    audience: {
      usersTotal: Number(audienceRow.users_total),
      usersNew: Number(audienceRow.users_new),
      pushTotal: Number(audienceRow.push_subscribers_total),
      pushNew: Number(audienceRow.push_subscribers_new),
      emailOptIn: Number(audienceRow.email_opt_in),
    },
    content: {
      lessons: unwrapCount(lessons, 'lessons'),
      publishedLessons: unwrapCount(publishedLessons, 'published lessons'),
      audioFiles: unwrapCount(audioFiles, 'audio files'),
      images: unwrapCount(images, 'images'),
      series: unwrapCount(series, 'series'),
      bookmarks: unwrapCount(bookmarks, 'bookmarks'),
    },
    completion: {
      tracked: unwrapCount(tracked, 'progress'),
      completed: unwrapCount(completed, 'completed progress'),
    },
    listensPerDay: fillDailySeries(
      perDay.map((row) => ({
        day: row.day,
        listens: Number(row.listens),
        listeners: Number(row.listeners),
        listenedSeconds: Number(row.listened_seconds),
      })),
      days,
      today,
      (day) => ({ day, listens: 0, listeners: 0, listenedSeconds: 0 }),
    ),
    signupsPerDay: fillDailySeries(
      signups.map((row) => ({ day: row.day, count: Number(row.signups) })),
      days,
      today,
      emptyCount,
    ),
    pushPerDay: fillDailySeries(
      push.map((row) => ({ day: row.day, count: Number(row.subscribers) })),
      days,
      today,
      emptyCount,
    ),
    topByListens: (unwrap(topByListens, 'top lessons') as TopLessonRow[]).map(toTopLesson),
    topByMinutes: (unwrap(topByMinutes, 'top lessons by minutes') as TopLessonRow[]).map(toTopLesson),
    recentSignups: (
      unwrap(recentSignups, 'recent signups') as {
        user_id: string;
        email: string | null;
        display_name: string | null;
        created_at: string;
      }[]
    ).map((row) => ({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
    })),
  };
}
