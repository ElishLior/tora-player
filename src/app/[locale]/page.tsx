export const dynamic = 'force-dynamic';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRecentLessons, getRecentProgress, getAllSeries } from '@/lib/supabase/queries';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { BookOpen, ListMusic, Bookmark, Scissors, Plus, ChevronLeft } from 'lucide-react';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tCommon = await getTranslations('common');

  const supabase = await createServerSupabaseClient();

  let recentLessons: Awaited<ReturnType<typeof getRecentLessons>> = [];
  let continueListening: Awaited<ReturnType<typeof getRecentProgress>> = [];
  let series: Awaited<ReturnType<typeof getAllSeries>> = [];
  if (supabase) {
    try {
      [recentLessons, continueListening, series] = await Promise.all([
        getRecentLessons(supabase, 10),
        getRecentProgress(supabase, 5),
        getAllSeries(supabase),
      ]);
    } catch {
      // defaults already set
    }
  }

  const isRTL = locale === 'he';

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Greeting - Spotify style */}
      <section className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">{t('welcome')}</h1>
      </section>

      {/* Quick Access — compact grid cards */}
      <section>
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/lessons"
            className="flex items-center gap-3 rounded-md bg-[hsl(var(--surface-elevated))] p-3 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
          >
            <div className="h-8 w-8 rounded bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold">{tCommon('lessons')}</span>
          </Link>
          <Link
            href="/playlists"
            className="flex items-center gap-3 rounded-md bg-[hsl(var(--surface-elevated))] p-3 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
          >
            <div className="h-8 w-8 rounded bg-gradient-to-br from-blue-500/40 to-blue-500/20 flex items-center justify-center">
              <ListMusic className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-sm font-semibold">{tCommon('playlists')}</span>
          </Link>
          <Link
            href="/bookmarks"
            className="flex items-center gap-3 rounded-md bg-[hsl(var(--surface-elevated))] p-3 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
          >
            <div className="h-8 w-8 rounded bg-gradient-to-br from-amber-500/40 to-amber-500/20 flex items-center justify-center">
              <Bookmark className="h-4 w-4 text-amber-400" />
            </div>
            <span className="text-sm font-semibold">{tCommon('bookmarks')}</span>
          </Link>
          <Link
            href="/series"
            className="flex items-center gap-3 rounded-md bg-[hsl(var(--surface-elevated))] p-3 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
          >
            <div className="h-8 w-8 rounded bg-gradient-to-br from-purple-500/40 to-purple-500/20 flex items-center justify-center">
              <Scissors className="h-4 w-4 text-purple-400" />
            </div>
            <span className="text-sm font-semibold">
              {tCommon('series')}
              {series.length > 0 && <span className="text-muted-foreground ms-1">({series.length})</span>}
            </span>
          </Link>
        </div>
      </section>

      {/* Continue Listening */}
      {continueListening.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">{t('continueListening')}</h2>
          </div>
          <div className="space-y-0.5">
            {continueListening.map((item) => (
              <LessonCard
                key={item.lesson_id}
                lesson={item.lesson}
                showProgress
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Lessons */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{t('recentLessons')}</h2>
          <div className="flex items-center gap-2">
            <Link
              href="/lessons"
              className="flex items-center gap-0.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              {isRTL ? 'הצג הכל' : 'Show all'}
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/lessons/upload"
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              {isRTL ? 'הוסף' : 'Add'}
            </Link>
          </div>
        </div>
        {recentLessons.length > 0 ? (
          <div className="space-y-0.5">
            {recentLessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={isRTL ? 'אין שיעורים עדיין' : 'No lessons yet'}
            description={isRTL ? 'הוסף שיעור ראשון כדי להתחיל' : 'Add your first lesson to get started'}
            action={
              <Link
                href="/lessons/upload"
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all"
              >
                {isRTL ? 'הוספת שיעור' : 'Add Lesson'}
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
