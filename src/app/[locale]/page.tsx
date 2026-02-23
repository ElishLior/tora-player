import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRecentLessons, getRecentProgress, getAllSeries } from '@/lib/supabase/queries';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { BookOpen, ListMusic, Bookmark, Download, Plus } from 'lucide-react';

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

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <section className="text-center py-6">
        <h1 className="text-3xl font-bold text-primary mb-2">{t('welcome')}</h1>
        <p className="text-muted-foreground">{t('welcomeDesc')}</p>
      </section>

      {/* Continue Listening */}
      {continueListening.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">{t('continueListening')}</h2>
          <div className="space-y-3">
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{t('recentLessons')}</h2>
          <Link
            href="/lessons/upload"
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {locale === 'he' ? 'הוסף' : 'Add'}
          </Link>
        </div>
        {recentLessons.length > 0 ? (
          <div className="space-y-3">
            {recentLessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={locale === 'he' ? 'אין שיעורים עדיין' : 'No lessons yet'}
            description={locale === 'he' ? 'הוסף שיעור ראשון כדי להתחיל' : 'Add your first lesson to get started'}
            action={
              <Link
                href="/lessons/upload"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {locale === 'he' ? 'הוספת שיעור' : 'Add Lesson'}
              </Link>
            }
          />
        )}
      </section>

      {/* Quick Access */}
      <section>
        <h2 className="text-xl font-bold mb-4">{t('quickAccess')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            href="/lessons"
            className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors"
          >
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">{tCommon('lessons')}</span>
          </Link>
          <Link
            href="/playlists"
            className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors"
          >
            <ListMusic className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">{tCommon('playlists')}</span>
          </Link>
          <Link
            href="/bookmarks"
            className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors"
          >
            <Bookmark className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">{tCommon('bookmarks')}</span>
          </Link>
          <Link
            href="/series"
            className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors"
          >
            <Download className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">{tCommon('series')}</span>
            <span className="text-xs text-muted-foreground">{series.length}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
