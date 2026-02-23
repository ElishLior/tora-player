import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRecentLessons } from '@/lib/supabase/queries';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { BookOpen, Plus, Search } from 'lucide-react';
import type { LessonWithRelations } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

function groupByDate(lessons: LessonWithRelations[], locale: string) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const groups: { label: string; lessons: LessonWithRelations[] }[] = [
    { label: locale === 'he' ? 'היום' : 'Today', lessons: [] },
    { label: locale === 'he' ? 'השבוע' : 'This Week', lessons: [] },
    { label: locale === 'he' ? 'החודש' : 'This Month', lessons: [] },
    { label: locale === 'he' ? 'ישנים יותר' : 'Older', lessons: [] },
  ];

  for (const lesson of lessons) {
    if (lesson.date >= today) groups[0].lessons.push(lesson);
    else if (lesson.date >= weekAgo) groups[1].lessons.push(lesson);
    else if (lesson.date >= monthAgo) groups[2].lessons.push(lesson);
    else groups[3].lessons.push(lesson);
  }

  return groups.filter(g => g.lessons.length > 0);
}

export default async function LessonsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('lessons');

  const supabase = await createServerSupabaseClient();

  let lessons: LessonWithRelations[] = [];
  if (supabase) {
    try {
      if (q) {
        const { data } = await supabase
          .from('lessons')
          .select('*, series(name, hebrew_name)')
          .eq('is_published', true)
          .or(`title.ilike.%${q}%,hebrew_title.ilike.%${q}%,description.ilike.%${q}%`)
          .order('date', { ascending: false })
          .limit(50);
        lessons = (data || []) as LessonWithRelations[];
      } else {
        lessons = await getRecentLessons(supabase, 100);
      }
    } catch {
      lessons = [];
    }
  }

  const groups = groupByDate(lessons, locale);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link
          href="/lessons/upload"
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('addLesson')}
        </Link>
      </div>

      {/* Search */}
      <form className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          placeholder={locale === 'he' ? 'חיפוש שיעורים...' : 'Search lessons...'}
          className="w-full rounded-xl border bg-background ps-10 pe-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </form>

      {/* Lesson groups */}
      {groups.length > 0 ? (
        groups.map((group) => (
          <section key={group.label}>
            <h2 className="text-lg font-semibold mb-3 text-muted-foreground">
              {group.label}
            </h2>
            <div className="space-y-3">
              {group.lessons.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} showProgress />
              ))}
            </div>
          </section>
        ))
      ) : (
        <EmptyState
          icon={BookOpen}
          title={q ? (locale === 'he' ? 'לא נמצאו תוצאות' : 'No results found') : t('noLessons')}
        />
      )}
    </div>
  );
}
