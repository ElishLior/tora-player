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
import { AlertTriangle, BookOpen, Plus, Search, X } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import { lessonsHref, tagFromSearchParam, tagPath, type TagCount } from '@/lib/tag-links';
import type { LessonWithRelations, Category } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; type?: string; cat?: string; tag?: string | string[] }>;
};

/** Tag chips shown in the filter row before "more". */
const TOP_TAG_CHIPS = 8;

const chipClass = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-primary text-primary-foreground'
      : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground hover:text-foreground'
  }`;

export default async function LessonsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q, type: audioTypeFilter, cat: categoryFilter, tag: tagParam } = await searchParams;
  const tagFilter = tagFromSearchParam(tagParam);
  setRequestLocale(locale);
  const t = await getTranslations('lessons');
  const commonT = await getTranslations('common');
  const tagT = await getTranslations('tagBrowse');

  const supabase = await createServerSupabaseClient();
  const admin = await isAdmin();

  let lessons: LessonWithRelations[] = [];
  let hasMore = false;
  let isSearchMode = false;
  let allCategories: Category[] = [];
  let matchedTags: string[] = [];
  let loadError: { code: LessonListFailureCode; message: string } | null = null;

  const lessonListResult = await loadInitialLessonList(
    supabase ? createSupabaseLessonListReader(supabase) : null,
    { q, audioTypeFilter, categoryFilter, tagFilter },
  );

  allCategories = lessonListResult.allCategories;
  const tagCounts: TagCount[] = lessonListResult.tagCounts;

  if (lessonListResult.ok) {
    lessons = lessonListResult.lessons;
    hasMore = lessonListResult.hasMore;
    isSearchMode = lessonListResult.isSearchMode;
    matchedTags = lessonListResult.matchedTags;
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

  // Most used tags, with the active tag always visible.
  const tagChips = tagCounts.slice(0, TOP_TAG_CHIPS).map((row) => row.tag);
  if (tagFilter && !tagChips.includes(tagFilter)) tagChips.unshift(tagFilter);

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
        {tagFilter && <input type="hidden" name="tag" value={tagFilter} />}
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
          return (
            <Link
              key={`type-${tab.value}`}
              href={lessonsHref({ q, type: tab.value, tag: tagFilter })}
              className={chipClass(isActive)}
            >
              {tab.label}
            </Link>
          );
        })}

        {/* Category filter tabs */}
        {leafCategories.map((cat) => {
          const isActive = categoryFilter === cat.id;
          return (
            <Link
              key={`cat-${cat.id}`}
              href={lessonsHref({ q, cat: cat.id, tag: tagFilter })}
              className={chipClass(isActive)}
            >
              {cat.hebrew_name}
            </Link>
          );
        })}
      </div>

      {/* Tag filter: most used tags; the active one toggles off */}
      {tagChips.length > 0 && (
        <nav aria-label={tagT('filterLabel')} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0">
          <ul className="flex w-max gap-2 pb-1 md:w-auto md:flex-wrap">
            {tagChips.map((tag) => {
              const isActive = tag === tagFilter;
              return (
                <li key={tag}>
                  <Link
                    href={lessonsHref({ q, type: audioTypeFilter, cat: categoryFilter, tag: isActive ? undefined : tag })}
                    aria-current={isActive ? 'true' : undefined}
                    aria-label={isActive ? tagT('clearTag', { tag }) : undefined}
                    className={`inline-flex items-center gap-1 whitespace-nowrap ${chipClass(isActive)}`}
                  >
                    <bdi>#{tag}</bdi>
                    {isActive && <X className="h-3 w-3" aria-hidden />}
                  </Link>
                </li>
              );
            })}
            {tagCounts.length > TOP_TAG_CHIPS && (
              <li>
                <Link href="/tags" className={`inline-flex whitespace-nowrap ${chipClass(false)}`}>
                  {tagT('more')}
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}

      {/* Search mode: tags matching the query */}
      {isSearchMode && matchedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{tagT('matchingTags')}</span>
          {matchedTags.slice(0, TOP_TAG_CHIPS).map((tag) => (
            <Link
              key={tag}
              href={tagPath(tag)}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
            >
              <bdi>#{tag}</bdi>
            </Link>
          ))}
        </div>
      )}

      {/* Lesson content */}
      {loadError ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('loadErrorTitle')}
          description={t('loadErrorDescription')}
          action={
            <Link
              href={lessonsHref({ q, type: audioTypeFilter, cat: categoryFilter, tag: tagFilter })}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {commonT('retry')}
            </Link>
          }
        />
      ) : lessons.length > 0 ? (
        isSearchMode ? (
          <LessonsClient
            key={lessonsHref({ q, type: audioTypeFilter, cat: categoryFilter, tag: tagFilter })}
            initialLessons={[]}
            initialHasMore={false}
            locale={locale}
            admin={admin}
            categories={allCategories}
            searchLessons={lessons}
          />
        ) : (
          <LessonsClient
            key={lessonsHref({ type: audioTypeFilter, cat: categoryFilter, tag: tagFilter })}
            initialLessons={lessons}
            initialHasMore={hasMore}
            locale={locale}
            audioTypeFilter={audioTypeFilter}
            categoryFilter={categoryFilter}
            tagFilter={tagFilter}
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
