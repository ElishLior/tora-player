'use client';

import { useEffect, useState } from 'react';
import { useProgressStore } from '@/stores/progress-store';
import { getLessonsByIds } from '@/actions/lessons';
import { LessonCard } from '@/components/lessons/lesson-card';
import type { LessonWithRelations } from '@/types/database';

interface Props {
  title: string;
}

export function ContinueListeningSection({ title }: Props) {
  const [lessons, setLessons] = useState<LessonWithRelations[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const progressMap = useProgressStore.getState().progressMap;

    // Get recent non-completed lessons sorted by last played
    const recent = Object.values(progressMap)
      .filter((p) => !p.completed && p.position > 30) // at least 30s played
      .sort((a, b) => new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime())
      .slice(0, 5);

    if (!recent.length) return;

    const ids = recent.map((r) => r.lessonId);
    getLessonsByIds(ids).then((data) => {
      // Sort by recency and inject local progress so the progress bar shows correctly
      const sorted = ids
        .map((id) => {
          const lesson = data.find((l) => l.id === id);
          if (!lesson) return null;
          const lp = progressMap[id];
          return {
            ...lesson,
            progress: lp
              ? {
                  id: '',
                  lesson_id: id,
                  position: lp.position,
                  completed: lp.completed,
                  last_played_at: lp.lastPlayed,
                  created_at: lp.lastPlayed,
                  updated_at: lp.lastPlayed,
                }
              : lesson.progress,
          };
        })
        .filter(Boolean) as LessonWithRelations[];
      setLessons(sorted);
    });
  }, []);

  if (!mounted || !lessons.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="space-y-0.5">
        {lessons.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} showProgress />
        ))}
      </div>
    </section>
  );
}
