export const dynamic = 'force-dynamic';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/shared/empty-state';
import { LessonCard } from '@/components/lessons/lesson-card';
import { LessonsClient } from './lessons-client';
import { Link } from '@/i18n/routing';
import { BookOpen, Plus, Search } from 'lucide-react';
import { isAdmin } from '@/actions/auth';
import type { LessonWithRelations } from '@/types/database';

const PAGE_SIZE = 20;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; type?: string }>;
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
  const { q, type: audioTypeFilter } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('lessons');

  const supabase = await createServerSupabaseClient();
  const admin = await isAdmin();

  let lessons: LessonWithRelations[] = [];
  let hasMore = false;
  let isSearchMode = false;

  if (supabase) {
    try {
      // If filtering by audio type, get matching lesson IDs first
      let filterLessonIds: string[] | null = null;
      if (audioTypeFilter) {
        const { data: audioMatches } = await supabase
          .from('lesson_audio')
          .select('lesson_id')
          .eq('audio_type', audioTypeFilter);
        filterLessonIds = [...new Set((audioMatches || []).map((a: { lesson_id: string }) => a.lesson_id))];
      }

      if (q) {
        // Search mode: return all results without infinite scroll
        isSearchMode = true;
        const escaped = q.replace(/[%_\\]/g, '\\$&');
        let query = supabase
          .from('lessons')
          .select('*, series(name, hebrew_name)')
          .eq('is_published', true)
          .or(`title.ilike.%${escaped}%,hebrew_title.ilike.%${escaped}%,description.ilike.%${escaped}%`)
          .order('date', { ascending: false })
          .limit(50);
        if (filterLessonIds) {
          query = query.in('id', filterLessonIds);
        }
        const { data } = await query;
        lessons = (data || []) as LessonWithRelations[];
      } else if (filterLessonIds) {
        // Audio type filter with pagination
        const { data } = await supabase
          .from('lessons')
          .select('*, series(name, hebrew_name)')
          .eq('is_published', true)
          .in('id', filterLessonIds)
          .order('date', { ascending: false })
          .range(0, PAGE_SIZE);

        lessons = (data || []) as LessonWithRelations[];
        hasMore = lessons.length > PAGE_SIZE;
        if (hasMore) lessons = lessons.slice(0, PAGE_SIZE);
      } else {
        // Default: paginated listing
        const { data } = await supabase
          .from('lessons')
          .select('*, series(name, hebrew_name)')
          .eq('is_published', true)
          .order('date', { ascending: false })
          .range(0, PAGE_SIZE);

        lessons = (data || []) as LessonWithRelations[];
        hasMore = lessons.length > PAGE_SIZE;
        if (hasMore) lessons = lessons.slice(0, PAGE_SIZE);
      }
    } catch {
      lessons = [];
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {admin && (
          <Link
            href="/lessons/upload"
            className="flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('addLesson')}
          </Link>
        )}
      </div>

      {/* Search */}
      <form className="relative">
        <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          placeholder={locale === 'he' ? 'חיפוש שיעורים...' : 'Search lessons...'}
          className="w-full rounded-full bg-[hsl(var(--surface-elevated))] ps-10 pe-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
        />
      </form>

      {/* Audio type filter tabs */}
      <div className="flex gap-2" dir="rtl">
        {[
          { value: '', label: 'הכל' },
          { value: 'סידור', label: 'סידור' },
          { value: 'עץ חיים', label: 'עץ חיים' },
        ].map((tab) => {
          const isActive = (audioTypeFilter || '') === tab.value;
          const params = new URLSearchParams();
          if (q) params.set('q', q);
          if (tab.value) params.set('type', tab.value);
          const href = params.toString() ? `?${params.toString()}` : '?';
          return (
            <a
              key={tab.value}
              href={href}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>

      {/* Lesson content */}
      {lessons.length > 0 ? (
        isSearchMode ? (
          // Search mode: render all results without infinite scroll
          groupByDate(lessons, locale).map((group) => (
            <section key={group.label}>
              <h2 className="text-sm font-bold mb-2 text-muted-foreground uppercase tracking-wider">
                {group.label}
              </h2>
              <div className="space-y-0.5">
                {group.lessons.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} showProgress />
                ))}
              </div>
            </section>
          ))
        ) : (
          // Normal mode: infinite scroll client component
          <LessonsClient
            initialLessons={lessons}
            initialHasMore={hasMore}
            locale={locale}
            audioTypeFilter={audioTypeFilter}
          />
        )
      ) : (
        <EmptyState
          icon={BookOpen}
          title={q ? (locale === 'he' ? 'לא נמצאו תוצאות' : 'No results found') : t('noLessons')}
        />
      )}
    </div>
  );
}
