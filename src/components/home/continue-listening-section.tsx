'use client';

import { useEffect, useMemo, useState } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { useHydrated } from '@/hooks/use-hydrated';
import { getLessonsByIds } from '@/actions/lessons';
import { LessonCard } from '@/components/lessons/lesson-card';
import { getLessonTracks } from '@/lib/lesson-tracks';
import { getResumePoint } from '@/lib/lesson-progress';
import type { LessonWithRelations } from '@/types/database';

interface Props {
  title: string;
}

const SHELF_SIZE = 5;
// Fetch a few extra: some candidates turn out to have nothing left to continue.
const CANDIDATES = 10;

/**
 * Lessons the listener left in the middle, newest first. Their cards resume
 * at the saved part and position. Follows the device progress store, so it
 * updates after listening or an account sync.
 */
export function ContinueListeningSection({ title }: Props) {
  const hydrated = useHydrated();
  const progressMap = useProgressStore((s) => s.progressMap);
  const [lessons, setLessons] = useState<LessonWithRelations[]>([]);

  // Only a change in which lessons are candidates refetches, not every checkpoint.
  const idsKey = useMemo(
    () =>
      Object.values(progressMap)
        .filter((entry) => entry?.lessonId && !entry.completed)
        .sort((a, b) => Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed))
        .slice(0, CANDIDATES)
        .map((entry) => entry.lessonId)
        .join(','),
    [progressMap],
  );

  useEffect(() => {
    if (!hydrated || !idsKey) {
      setLessons([]);
      return;
    }
    let cancelled = false;
    const ids = idsKey.split(',');
    getLessonsByIds(ids)
      .then((rows) => {
        if (cancelled) return;
        const byId = new Map(rows.map((lesson) => [lesson.id, lesson]));
        setLessons(ids.map((id) => byId.get(id)).filter((lesson): lesson is LessonWithRelations => !!lesson));
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, idsKey]);

  const visible = lessons
    .filter((lesson) => {
      const point = getResumePoint(getLessonTracks(lesson), progressMap[lesson.id]);
      return point.index > 0 || point.position > 0;
    })
    .slice(0, SHELF_SIZE);

  if (!hydrated || visible.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="space-y-0.5">
        {visible.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} showProgress />
        ))}
      </div>
    </section>
  );
}
