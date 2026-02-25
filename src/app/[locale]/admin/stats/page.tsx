'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Music,
  Image,
  Library,
  Bookmark,
  Clock,
  CheckCircle2,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import {
  getOverviewStats,
  getPopularLessons,
  getRecentActivity,
  getCompletionStats,
  type OverviewStats,
  type PopularLesson,
  type DailyActivity,
  type CompletionStats,
} from '@/actions/stats';

export default function AdminStatsPage() {
  const params = useParams();
  const locale = params.locale as string;
  const isRTL = locale === 'he';
  const BackArrow = isRTL ? ArrowLeft : ArrowRight;

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [popular, setPopular] = useState<PopularLesson[]>([]);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [completion, setCompletion] = useState<CompletionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const [overviewRes, popularRes, activityRes, completionRes] = await Promise.all([
          getOverviewStats(),
          getPopularLessons(10),
          getRecentActivity(14),
          getCompletionStats(),
        ]);

        if (overviewRes.error) throw new Error(overviewRes.error);
        if (popularRes.error) throw new Error(popularRes.error);
        if (activityRes.error) throw new Error(activityRes.error);
        if (completionRes.error) throw new Error(completionRes.error);

        setOverview(overviewRes.data || null);
        setPopular(popularRes.data || []);
        setActivity(activityRes.data || []);
        setCompletion(completionRes.data || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const maxActivityCount = Math.max(...activity.map((a) => a.count), 1);

  const statCards = [
    {
      label: isRTL ? 'שיעורים' : 'Lessons',
      value: overview?.totalLessons || 0,
      icon: BookOpen,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
    },
    {
      label: isRTL ? 'קבצי שמע' : 'Audio Files',
      value: overview?.totalAudioFiles || 0,
      icon: Music,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
    },
    {
      label: isRTL ? 'תמונות' : 'Images',
      value: overview?.totalImages || 0,
      icon: Image,
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
    },
    {
      label: isRTL ? 'סדרות' : 'Series',
      value: overview?.totalSeries || 0,
      icon: Library,
      color: 'text-orange-400',
      bgColor: 'bg-orange-400/10',
    },
    {
      label: isRTL ? 'סימניות' : 'Bookmarks',
      value: overview?.totalBookmarks || 0,
      icon: Bookmark,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/10',
    },
    {
      label: isRTL ? 'שעות האזנה' : 'Listening Hours',
      value: overview?.totalListeningHours || 0,
      icon: Clock,
      color: 'text-pink-400',
      bgColor: 'bg-pink-400/10',
    },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/${locale}/admin`}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <BackArrow className="h-4 w-4" />
          <span>{isRTL ? 'חזרה ללוח בקרה' : 'Back to Dashboard'}</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {isRTL ? 'סטטיסטיקות' : 'Statistics'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isRTL ? 'סקירת נתוני האפליקציה' : 'Application data overview'}
            </p>
          </div>
        </div>
      </div>

      {/* Overview Stats Grid */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Completion Stats */}
      {completion && completion.totalProgress > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <h2 className="text-sm font-medium text-muted-foreground">
              {isRTL ? 'סטטוס השלמה' : 'Completion Status'}
            </h2>
          </div>
          <div className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                {isRTL
                  ? `${completion.totalCompleted} מתוך ${completion.totalProgress} הושלמו`
                  : `${completion.totalCompleted} of ${completion.totalProgress} completed`}
              </span>
              <span className="text-lg font-bold text-primary">{completion.completionRate}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-border/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${completion.completionRate}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {activity.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-muted-foreground">
              {isRTL ? 'פעילות ב-14 ימים אחרונים' : 'Activity - Last 14 Days'}
            </h2>
          </div>
          <div className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4">
            <div className="flex items-end gap-1" style={{ height: '120px' }}>
              {activity.map((day) => {
                const heightPercent = maxActivityCount > 0 ? (day.count / maxActivityCount) * 100 : 0;
                const dateObj = new Date(day.date + 'T00:00:00');
                const dayLabel = dateObj.toLocaleDateString(isRTL ? 'he-IL' : 'en-US', {
                  day: 'numeric',
                  month: 'numeric',
                });

                return (
                  <div
                    key={day.date}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div className="w-full flex items-end justify-center" style={{ height: '90px' }}>
                      <div
                        className="w-full max-w-[24px] rounded-t bg-primary/80 hover:bg-primary transition-colors min-h-[2px]"
                        style={{ height: `${Math.max(heightPercent, 2)}%` }}
                        title={`${dayLabel}: ${day.count} ${isRTL ? 'שיעורים' : 'lessons'}`}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground/60 leading-none">
                      {dateObj.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/40">
              <span>
                {new Date(activity[0]?.date + 'T00:00:00').toLocaleDateString(
                  isRTL ? 'he-IL' : 'en-US',
                  { month: 'short', day: 'numeric' }
                )}
              </span>
              <span>
                {new Date(activity[activity.length - 1]?.date + 'T00:00:00').toLocaleDateString(
                  isRTL ? 'he-IL' : 'en-US',
                  { month: 'short', day: 'numeric' }
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Popular Lessons */}
      {popular.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Music className="h-4 w-4 text-green-400" />
            <h2 className="text-sm font-medium text-muted-foreground">
              {isRTL ? 'שיעורים פופולריים' : 'Popular Lessons'}
            </h2>
          </div>
          <div className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] overflow-hidden">
            {popular.map((lesson, index) => (
              <Link
                key={lesson.lessonId}
                href={`/${locale}/lessons/${lesson.lessonId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--surface-highlight))] transition-colors border-b border-border/30 last:border-b-0"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {lesson.hebrewTitle || lesson.title}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {lesson.listenCount} {isRTL ? 'צפיות' : 'plays'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state if no data */}
      {!popular.length && !activity.some((a) => a.count > 0) && (
        <div className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-8 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">
            {isRTL ? 'אין עדיין נתוני פעילות' : 'No activity data yet'}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            {isRTL
              ? 'נתונים יופיעו כאשר משתמשים יתחילו להאזין לשיעורים'
              : 'Data will appear as users start listening to lessons'}
          </p>
        </div>
      )}
    </div>
  );
}
