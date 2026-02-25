'use client';

import { useState, useCallback } from 'react';
import { LessonCard } from '@/components/lessons/lesson-card';
import { LessonCardSkeleton } from '@/components/lessons/lesson-card-skeleton';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { getLessonsPaginated } from '@/actions/lessons-paginated';
import type { LessonWithRelations } from '@/types/database';

interface DateGroup {
  label: string;
  lessons: LessonWithRelations[];
}

interface LessonsClientProps {
  initialLessons: LessonWithRelations[];
  initialHasMore: boolean;
  locale: string;
  audioTypeFilter?: string;
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

export function LessonsClient({
  initialLessons,
  initialHasMore,
  locale,
  audioTypeFilter,
}: LessonsClientProps) {
  const [lessons, setLessons] = useState<LessonWithRelations[]>(initialLessons);
  const [hasMore, setHasMore] = useState(initialHasMore);

  const fetchMore = useCallback(async () => {
    const offset = lessons.length;
    const result = await getLessonsPaginated(offset, PAGE_SIZE, audioTypeFilter || undefined);
    setLessons((prev) => [...prev, ...result.lessons]);
    setHasMore(result.hasMore);
  }, [lessons.length, audioTypeFilter]);

  const { sentinelRef, isLoading } = useInfiniteScroll({ fetchMore, hasMore });

  const groups = groupByDate(lessons, locale);

  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      {groups.map((group) => (
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
      ))}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <LessonCardSkeleton key={`skeleton-${i}`} />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && <div ref={sentinelRef} className="h-4" />}
    </>
  );
}
