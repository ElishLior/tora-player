'use client';

import { useMemo } from 'react';
import { Play, StepForward } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHydrated } from '@/hooks/use-hydrated';
import { getLessonTracks } from '@/lib/lesson-tracks';
import { playLessons } from '@/lib/play-lesson';
import { useProgressStore } from '@/stores/progress-store';
import type { LessonWithRelations } from '@/types/database';

interface PlayLessonsButtonsProps {
  /** In listing order; "play all" follows it. */
  lessons: LessonWithRelations[];
  /**
   * Series: also offer to continue from the first lesson not yet heard, in
   * chronological order (oldest first), playing on through the later ones.
   */
  continueSeries?: boolean;
}

/** "Play all" for a lesson list (series, playlist), plus "continue series". */
export function PlayLessonsButtons({ lessons, continueSeries }: PlayLessonsButtonsProps) {
  const t = useTranslations('series');
  const tPlaylists = useTranslations('playlists');
  const hydrated = useHydrated();
  const progressMap = useProgressStore((s) => s.progressMap);

  const listed = useMemo(
    () => lessons.map((lesson) => ({ lesson, tracks: getLessonTracks(lesson) })).filter((item) => item.tracks.length > 0),
    [lessons],
  );
  const chronological = useMemo(
    () =>
      [...listed].sort(
        (a, b) => a.lesson.date.localeCompare(b.lesson.date) || (a.lesson.part_number ?? 0) - (b.lesson.part_number ?? 0),
      ),
    [listed],
  );

  if (listed.length === 0) return null;

  // Device-only progress decides where the series continues; shown after hydration.
  const continueIndex = continueSeries && hydrated
    ? chronological.findIndex(({ lesson }) => !progressMap[lesson.id]?.completed)
    : -1;
  const started = chronological.some(({ lesson }) => progressMap[lesson.id]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => playLessons(listed.map((item) => item.tracks))}
        className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Play className="h-4 w-4 fill-current" />
        {tPlaylists('playAll')}
      </button>
      {continueIndex >= 0 && (
        <button
          type="button"
          onClick={() => playLessons(chronological.map((item) => item.tracks), continueIndex)}
          className="flex items-center gap-1.5 rounded-full border border-[hsl(0,0%,30%)] px-4 py-2 text-sm font-bold text-foreground transition-colors hover:border-foreground"
        >
          <StepForward className="h-4 w-4 rtl:-scale-x-100" />
          {started ? t('continueSeries') : t('startSeries')}
        </button>
      )}
    </div>
  );
}
