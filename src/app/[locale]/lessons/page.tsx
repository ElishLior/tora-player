export const dynamic = 'force-dynamic';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { createCatalogLessonListReader, getCachedPartTypes } from '@/lib/supabase/anon';
import { LESSON_PART_TYPES, SHORTS_AUDIO_TYPE } from '@/lib/lesson-naming';
import { loadInitialLessonList, type LessonListFailureCode } from '@/lib/supabase/lesson-list';
import { EmptyState } from '@/components/shared/empty-state';
import { LessonsClient } from './lessons-client';
import { Link } from '@/i18n/routing';
import { AlertTriangle, BookOpen, Plus, Search, X } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import { dateFromSearchParam, lessonsHref, tagFromSearchParam, tagPath, type TagCount } from '@/lib/tag-links';
import { generateLessonMetadata } from '@/lib/hebrew-date';
import { pageAlternates } from '@/lib/seo';
import type { LessonWithRelations, Category } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; type?: string; cat?: string; tag?: string | string[]; date?: string | string[] }>;
};

/** Query-filtered lists share the main list canonical; tag pages retain their own indexable URLs. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { tag, date, q, type, cat } = await searchParams;
  return {
    alternates: pageAlternates('/lessons'),
    ...((tag || date || q || type || cat) && { robots: { index: false, follow: true } }),
  };
}

/** Tag chips shown in the filter row before "more". */
const TOP_TAG_CHIPS = 8;

const chipClass = (active: boolean, large = false) =>
  `inline-flex ${large ? 'min-h-11' : 'min-h-7'} items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
    active
      ? 'bg-primary text-primary-foreground'
      : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground hover:text-foreground'
  }`;

export default async function LessonsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q, type: audioTypeFilter, cat: categoryFilter, tag: tagParam, date: dateParam } = await searchParams;
  const tagFilter = tagFromSearchParam(tagParam);
  const dateFilter = dateFromSearchParam(dateParam);
  const dateLabel = dateFilter ? `${generateLessonMetadata(dateFilter).hebrewDate} (${dateFilter})` : '';
  setRequestLocale(locale);
  const t = await getTranslations('lessons');
  const commonT = await getTranslations('common');
  const tagT = await getTranslations('tagBrowse');
  const browseT = await getTranslations('lessonBrowse');
  const activeQuery = { q, type: audioTypeFilter, cat: categoryFilter, tag: tagFilter, date: dateFilter };
  const heading =
    dateFilter && tagFilter
      ? browseT('combinedHeading', { date: dateLabel, tag: tagFilter })
      : dateFilter
        ? browseT('dateHeading', { date: dateLabel })
        : tagFilter
          ? browseT('tagHeading', { tag: tagFilter })
          : t('title');

  const admin = await isAdmin();

  let lessons: LessonWithRelations[] = [];
  let hasMore = false;
  let isSearchMode = false;
  let allCategories: Category[] = [];
  let matchedTags: string[] = [];
  let loadError: { code: LessonListFailureCode; message: string } | null = null;

  const lessonListResult = await loadInitialLessonList(
    isSupabaseConfigured() ? createCatalogLessonListReader() : null,
    { q, audioTypeFilter, categoryFilter, tagFilter, dateFilter },
  );

  // Part-type chips: סידור / עץ חיים plus any type the admin added (קצרים has its own category).
  const usedPartTypes: string[] = isSupabaseConfigured()
    ? await getCachedPartTypes().catch(() => [...LESSON_PART_TYPES])
    : [...LESSON_PART_TYPES];
  const partTypeChips = usedPartTypes.filter((type) => type !== SHORTS_AUDIO_TYPE);
  if (audioTypeFilter && !partTypeChips.includes(audioTypeFilter)) partTypeChips.push(audioTypeFilter);

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
  const lessonsParent = allCategories.find((c) => c.name === 'Lessons' && !c.parent_id);
  const leafCategories = lessonsParent ? allCategories.filter((c) => c.parent_id === lessonsParent.id) : [];

  // Most used tags, with the active tag always visible.
  const tagChips = tagCounts.slice(0, TOP_TAG_CHIPS).map((row) => row.tag);
  if (tagFilter && !tagChips.includes(tagFilter)) tagChips.unshift(tagFilter);

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="min-w-0 break-words text-2xl font-bold">
          <bdi>{heading}</bdi>
        </h1>
        {admin && (
          <Link
            href="/lessons/upload"
            className="flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground transition-all hover:scale-105 hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('addLesson')}
          </Link>
        )}
      </div>

      {(dateFilter || tagFilter) && (
        <div className="flex flex-wrap gap-2">
          {dateFilter && (
            <Link
              href={lessonsHref({ ...activeQuery, date: undefined })}
              aria-label={browseT('clearDate')}
              data-active-date={dateFilter}
              className={`${chipClass(true, true)} max-w-full gap-2`}
            >
              <bdi className="min-w-0 break-words">{browseT('dateFilter', { date: dateLabel })}</bdi>
              <X className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          )}
          {tagFilter && (
            <Link
              href={lessonsHref({ ...activeQuery, tag: undefined })}
              aria-label={browseT('clearTag', { tag: tagFilter })}
              data-active-tag={tagFilter}
              className={`${chipClass(true, true)} max-w-full gap-2`}
            >
              <bdi className="min-w-0 break-words">{browseT('tagFilter', { tag: tagFilter })}</bdi>
              <X className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          )}
        </div>
      )}

      {/* Search */}
      <form className="relative">
        {tagFilter && <input type="hidden" name="tag" value={tagFilter} />}
        {dateFilter && <input type="hidden" name="date" value={dateFilter} />}
        {audioTypeFilter && <input type="hidden" name="type" value={audioTypeFilter} />}
        {categoryFilter && <input type="hidden" name="cat" value={categoryFilter} />}
        <Search className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          placeholder={locale === 'he' ? 'חיפוש שיעורים...' : 'Search lessons...'}
          className="w-full rounded-full border-0 bg-[hsl(var(--surface-elevated))] py-2.5 pe-4 ps-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </form>

      {/* Filter tabs: audio type + category */}
      <div className="flex flex-wrap gap-2" dir="rtl">
        {/* Audio type tabs */}
        {[{ value: '', label: 'הכל' }, ...partTypeChips.map((type) => ({ value: type, label: type }))].map((tab) => {
          const isActive = !categoryFilter && (audioTypeFilter || '') === tab.value;
          return (
            <Link
              key={`type-${tab.value}`}
              href={lessonsHref({ ...activeQuery, type: tab.value, cat: undefined })}
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
              href={lessonsHref({ ...activeQuery, cat: cat.id, type: undefined })}
              className={chipClass(isActive)}
            >
              {cat.hebrew_name}
            </Link>
          );
        })}
      </div>

      {/* Tag filter: most used tags; the active one toggles off */}
      {tagChips.length > 0 && (
        <nav
          aria-label={tagT('filterLabel')}
          className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0"
        >
          <ul className="flex w-max gap-2 pb-1 md:w-auto md:flex-wrap">
            {tagChips.map((tag) => {
              const isActive = tag === tagFilter;
              return (
                <li key={tag}>
                  <Link
                    href={lessonsHref({ ...activeQuery, tag: isActive ? undefined : tag })}
                    aria-current={isActive ? 'true' : undefined}
                    aria-label={isActive ? tagT('clearTag', { tag }) : browseT('tagLink', { tag })}
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
              href={lessonsHref(activeQuery)}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {commonT('retry')}
            </Link>
          }
        />
      ) : lessons.length > 0 ? (
        isSearchMode ? (
          <LessonsClient
            key={lessonsHref(activeQuery)}
            initialLessons={[]}
            initialHasMore={false}
            locale={locale}
            admin={admin}
            categories={allCategories}
            searchLessons={lessons}
          />
        ) : (
          <LessonsClient
            key={lessonsHref(activeQuery)}
            initialLessons={lessons}
            initialHasMore={hasMore}
            locale={locale}
            audioTypeFilter={audioTypeFilter}
            categoryFilter={categoryFilter}
            tagFilter={tagFilter}
            dateFilter={dateFilter}
            admin={admin}
            categories={allCategories}
          />
        )
      ) : (
        <EmptyState
          icon={BookOpen}
          title={
            dateFilter || tagFilter
              ? browseT('filteredEmpty')
              : q
                ? locale === 'he'
                  ? 'לא נמצאו תוצאות'
                  : 'No results found'
                : t('noLessons')
          }
        />
      )}
    </div>
  );
}
