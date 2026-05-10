'use client';

import { useState, useCallback, useMemo } from 'react';
import { LessonCard } from '@/components/lessons/lesson-card';
import { LessonCardSkeleton } from '@/components/lessons/lesson-card-skeleton';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { getLessonsPaginated } from '@/actions/lessons-paginated';
import { bulkUpdateLessonCategory } from '@/actions/lessons';
import {
  canAutoLoadMore,
  getLoadMoreErrorMessage,
} from '@/lib/lessons/pagination-state';
import { CheckSquare, X, Save, Loader2 } from 'lucide-react';
import type { LessonWithRelations, Category } from '@/types/database';

interface DateGroup {
  label: string;
  lessons: LessonWithRelations[];
}

interface LessonsClientProps {
  initialLessons: LessonWithRelations[];
  initialHasMore: boolean;
  locale: string;
  audioTypeFilter?: string;
  categoryFilter?: string;
  admin?: boolean;
  categories?: Category[];
  searchLessons?: LessonWithRelations[];
}

const PAGE_SIZE = 20;

function groupByDate(lessons: LessonWithRelations[], locale: string): DateGroup[] {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const groups: DateGroup[] = [
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

  return groups.filter((g) => g.lessons.length > 0);
}

function buildCategoryTree(categories: Category[]) {
  const parents = categories.filter((c) => !c.parent_id);
  return parents.map((parent) => ({
    ...parent,
    children: categories
      .filter((c) => c.parent_id === parent.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export function LessonsClient({
  initialLessons,
  initialHasMore,
  locale,
  audioTypeFilter,
  categoryFilter,
  admin,
  categories,
  searchLessons,
}: LessonsClientProps) {
  const isSearchMode = !!searchLessons;

  // Infinite scroll state (normal mode only)
  const [lessons, setLessons] = useState<LessonWithRelations[]>(initialLessons);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isRetryingPage, setIsRetryingPage] = useState(false);

  const fetchMore = useCallback(async () => {
    const offset = lessons.length;
    const result = await getLessonsPaginated(
      offset,
      PAGE_SIZE,
      audioTypeFilter || undefined,
      categoryFilter || undefined
    );

    if (result.error) {
      setPageError(getLoadMoreErrorMessage(locale));
      return;
    }

    setPageError(null);
    setLessons((prev) => [...prev, ...result.lessons]);
    setHasMore(result.hasMore);
  }, [lessons.length, audioTypeFilter, categoryFilter, locale]);

  const shouldAutoLoadMore = canAutoLoadMore({
    isSearchMode,
    hasMore,
    pageError,
  });

  const { sentinelRef, isLoading } = useInfiniteScroll({
    fetchMore,
    hasMore: shouldAutoLoadMore,
  });

  const retryLoadMore = useCallback(async () => {
    setIsRetryingPage(true);
    try {
      await fetchMore();
    } finally {
      setIsRetryingPage(false);
    }
  }, [fetchMore]);

  // All visible lessons (either search results or paginated)
  const allLessons = isSearchMode ? searchLessons : lessons;

  // Bulk edit state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  const categoryTree = useMemo(() => buildCategoryTree(categories || []), [categories]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allLessons.map((l) => l.id)));
  }, [allLessons]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSelectedCategoryId('');
    setBulkError(null);
    setBulkSuccess(null);
  }, []);

  const handleBulkSave = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const categoryId = selectedCategoryId === '' ? null : selectedCategoryId === '__clear__' ? null : selectedCategoryId;

    // If no category selected and not clearing
    if (selectedCategoryId === '') {
      setBulkError(locale === 'he' ? 'בחר קטגוריה' : 'Select a category');
      return;
    }

    setBulkLoading(true);
    setBulkError(null);
    setBulkSuccess(null);

    const result = await bulkUpdateLessonCategory(
      Array.from(selectedIds),
      categoryId
    );

    setBulkLoading(false);

    if (result.error) {
      setBulkError(result.error);
    } else {
      const count = selectedIds.size;
      setBulkSuccess(
        locale === 'he'
          ? `${count} שיעורים עודכנו בהצלחה`
          : `${count} lessons updated successfully`
      );

      // Update local lesson data to reflect the change
      const newCategory = categoryId
        ? (categories?.find((c) => c.id === categoryId) ?? null)
        : null;

      if (isSearchMode) {
        // search mode — can't update easily, rely on revalidation
      } else {
        setLessons((prev) =>
          prev.map((l) =>
            selectedIds.has(l.id)
              ? { ...l, category_id: categoryId, category: newCategory }
              : l
          )
        );
      }

      // Clear selection after short delay so user sees the success message
      setTimeout(() => {
        exitSelectionMode();
      }, 1500);
    }
  }, [selectedIds, selectedCategoryId, locale, categories, isSearchMode, exitSelectionMode]);

  const groups = groupByDate(allLessons, locale);

  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      {/* Bulk edit toggle button (admin only) */}
      {admin && !selectionMode && (
        <button
          onClick={() => setSelectionMode(true)}
          className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-elevated))] px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors mb-3"
          dir="rtl"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {locale === 'he' ? 'עריכת קטגוריות' : 'Edit Categories'}
        </button>
      )}

      {/* Selection mode header */}
      {selectionMode && (
        <div className="flex items-center justify-between bg-[hsl(var(--surface-elevated))] rounded-lg px-4 py-2 mb-3" dir="rtl">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? locale === 'he'
                ? `${selectedIds.size} שיעורים נבחרו`
                : `${selectedIds.size} selected`
              : locale === 'he'
                ? 'לחץ על שיעורים לבחירה'
                : 'Click lessons to select'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              {locale === 'he' ? 'בחר הכל' : 'Select All'}
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={clearSelection}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {locale === 'he' ? 'נקה' : 'Clear'}
              </button>
            )}
            <button
              onClick={exitSelectionMode}
              className="text-muted-foreground hover:text-foreground transition-colors ms-2"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Lesson groups */}
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="text-sm font-bold mb-2 text-muted-foreground uppercase tracking-wider">
            {group.label}
          </h2>
          <div className="space-y-0.5">
            {group.lessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                showProgress={!selectionMode}
                selectable={selectionMode}
                selected={selectedIds.has(lesson.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Loading skeletons (normal mode only) */}
      {!isSearchMode && isLoading && (
        <div className="space-y-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <LessonCardSkeleton key={`skeleton-${i}`} />
          ))}
        </div>
      )}

      {!isSearchMode && pageError && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between"
          dir={locale === 'he' ? 'rtl' : 'ltr'}
        >
          <span>{pageError}</span>
          <button
            type="button"
            onClick={retryLoadMore}
            disabled={isRetryingPage}
            className="self-start rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:self-auto"
          >
            {isRetryingPage
              ? locale === 'he'
                ? 'טוען...'
                : 'Loading...'
              : locale === 'he'
                ? 'נסה שוב'
                : 'Retry'}
          </button>
        </div>
      )}

      {/* Infinite scroll sentinel (normal mode only) */}
      {!isSearchMode && hasMore && <div ref={sentinelRef} className="h-4" />}

      {/* Floating action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-20 inset-x-0 z-50 flex justify-center px-4" dir="rtl">
          <div className="bg-[hsl(var(--surface-elevated))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-md w-full">
            {/* Category picker */}
            <select
              value={selectedCategoryId}
              onChange={(e) => {
                setSelectedCategoryId(e.target.value);
                setBulkError(null);
              }}
              className="flex-1 bg-background text-foreground text-sm rounded-lg px-3 py-2 border border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-primary/30"
              dir="rtl"
            >
              <option value="">{locale === 'he' ? 'בחר קטגוריה...' : 'Select category...'}</option>
              <option value="__clear__">{locale === 'he' ? '— ללא קטגוריה —' : '— No category —'}</option>
              {categoryTree.map((parent) =>
                parent.children.length > 0 ? (
                  <optgroup key={parent.id} label={parent.hebrew_name}>
                    {parent.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.hebrew_name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={parent.id} value={parent.id}>
                    {parent.hebrew_name}
                  </option>
                )
              )}
            </select>

            {/* Save button */}
            <button
              onClick={handleBulkSave}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {bulkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {locale === 'he' ? 'שמור' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Error/Success toast */}
      {(bulkError || bulkSuccess) && (
        <div className="fixed bottom-4 inset-x-0 z-50 flex justify-center px-4" dir="rtl">
          <div
            className={`rounded-xl px-4 py-2 text-sm font-medium shadow-lg ${
              bulkError
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-green-500/10 text-green-400 border border-green-500/20'
            }`}
          >
            {bulkError || bulkSuccess}
          </div>
        </div>
      )}
    </>
  );
}
