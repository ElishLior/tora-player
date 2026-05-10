export const dynamic = 'force-dynamic';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  createSupabaseLessonListReader,
  loadInitialLessonList,
  type LessonListFailureCode,
} from '@/lib/supabase/lesson-list';
import { EmptyState } from '@/components/shared/empty-state';
import { LessonsClient } from './lessons-client';
import { Link } from '@/i18n/routing';
import { AlertTriangle, BookOpen, Plus, Search } from 'lucide-react';
import { isAdmin } from '@/actions/auth';
import type { LessonWithRelations, Category } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; type?: string; cat?: string }>;
};

function buildRetryHref(filters: { q?: string; audioTypeFilter?: string; categoryFilter?: string }) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.audioTypeFilter) params.set('type', filters.audioTypeFilter);
  if (filters.categoryFilter) params.set('cat', filters.categoryFilter);
  const query = params.toString();
  return query ? `/lessons?${query}` : '/lessons';
}

export default async function LessonsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q, type: audioTypeFilter, cat: categoryFilter } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('lessons');
  const commonT = await getTranslations('common');

  const supabase = await createServerSupabaseClient();
  const admin = await isAdmin();

  let lessons: LessonWithRelations[] = [];
  let hasMore = false;
  let isSearchMode = false;
  let allCategories: Category[] = [];
  let loadError: { code: LessonListFailureCode; message: string } | null = null;

  const lessonListResult = await loadInitialLessonList(
    supabase ? createSupabaseLessonListReader(supabase) : null,
    { q, audioTypeFilter, categoryFilter },
  );

  allCategories = lessonListResult.allCategories;

  if (lessonListResult.ok) {
    lessons = lessonListResult.lessons;
    hasMore = lessonListResult.hasMore;
    isSearchMode = lessonListResult.isSearchMode;
  } else {
    console.error('Failed to load lessons page:', {
      code: lessonListResult.code,
      message: lessonListResult.message,
    });
    loadError = {
      code: lessonListResult.code,
      message: lessonListResult.message,
    };
  }

  // Build leaf categories for filter tabs (sub-categories under "שיעורים")
  const lessonsParent = allCategories.find(c => c.name === 'Lessons' && !c.parent_id);
  const leafCategories = lessonsParent
    ? allCategories.filter(c => c.parent_id === lessonsParent.id)
    : [];

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

      {/* Filter tabs: audio type + category */}
      <div className="flex gap-2 flex-wrap" dir="rtl">
        {/* Audio type tabs */}
        {[
          { value: '', label: 'הכל' },
          { value: 'סידור', label: 'סידור' },
          { value: 'עץ חיים', label: 'עץ חיים' },
        ].map((tab) => {
          const isActive = !categoryFilter && (audioTypeFilter || '') === tab.value;
          const p = new URLSearchParams();
          if (q) p.set('q', q);
          if (tab.value) p.set('type', tab.value);
          const href = p.toString() ? `?${p.toString()}` : '?';
          return (
            <a
              key={`type-${tab.value}`}
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

        {/* Category filter tabs */}
        {leafCategories.map((cat) => {
          const isActive = categoryFilter === cat.id;
          const p = new URLSearchParams();
          if (q) p.set('q', q);
          p.set('cat', cat.id);
          return (
            <a
              key={`cat-${cat.id}`}
              href={`?${p.toString()}`}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat.hebrew_name}
            </a>
          );
        })}
      </div>

      {/* Lesson content */}
      {loadError ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('loadErrorTitle')}
          description={t('loadErrorDescription')}
          action={
            <Link
              href={buildRetryHref({ q, audioTypeFilter, categoryFilter })}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {commonT('retry')}
            </Link>
          }
        />
      ) : lessons.length > 0 ? (
        isSearchMode ? (
          <LessonsClient
            initialLessons={[]}
            initialHasMore={false}
            locale={locale}
            admin={admin}
            categories={allCategories}
            searchLessons={lessons}
          />
        ) : (
          <LessonsClient
            initialLessons={lessons}
            initialHasMore={hasMore}
            locale={locale}
            audioTypeFilter={audioTypeFilter}
            categoryFilter={categoryFilter}
            admin={admin}
            categories={allCategories}
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
