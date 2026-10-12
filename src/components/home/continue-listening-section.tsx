'use client';

import { lessonPath } from '@/config/site';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useProgressStore } from '@/stores/progress-store';
import { useHydrated } from '@/hooks/use-hydrated';
import { getLessonsByIds } from '@/actions/lessons';
import { LessonPlayButton } from '@/components/lessons/lesson-play-button';
import { getLessonTracks } from '@/lib/lesson-tracks';
import { getListenedFraction, getResumePoint } from '@/lib/lesson-progress';
import type { LessonWithRelations } from '@/types/database';

interface Props {
  title: string;
}

// Fetch a few extra: some candidates turn out to have nothing left to continue.
const CANDIDATES = 10;

/**
 * The lesson the listener left in the middle most recently, as one slim strip
 * with its progress bar. The button resumes at the saved part and position.
 * Follows the device progress store, so it updates after listening or an
 * account sync.
 */
export function ContinueListeningSection({ title }: Props) {
  const t = useTranslations('player');
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

  const lesson = lessons.find((candidate) => {
    const tracks = getLessonTracks(candidate);
    const point = getResumePoint(tracks, progressMap[candidate.id]);
    return point.index > 0 || point.position > 0;
  });

  if (!hydrated || !lesson) return null;

  const tracks = getLessonTracks(lesson);
  const saved = progressMap[lesson.id];
  const percent = Math.round(getListenedFraction(tracks, saved) * 100);
  const part = getResumePoint(tracks, saved).index + 1;

  return (
    <section
      aria-label={title}
      className="relative flex items-center gap-3 rounded-2xl bg-[hsl(var(--surface-elevated))] py-2.5 ps-3 pe-2.5"
    >
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="text-[13px] font-semibold text-primary">
          {title}
          {tracks.length > 1 && <span className="text-muted-foreground"> · {t('part', { number: part })}</span>}
        </p>
        <Link
          href={lessonPath(lesson)}
          dir="auto"
          className="truncate text-[15px] font-bold text-foreground before:absolute before:inset-0 before:content-[''] focus-visible:outline-none"
        >
          {lesson.hebrew_title || lesson.title}
        </Link>
        <span
          className="block h-[3px] overflow-hidden rounded-full bg-foreground/12"
          role="progressbar"
          aria-label={lesson.hebrew_title || lesson.title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </span>
      </div>
      <LessonPlayButton
        lessonId={lesson.id}
        tracks={tracks}
        playLabel={t('play')}
        pauseLabel={t('pause')}
        className="h-11 w-11 bg-primary text-primary-foreground hover:bg-primary/90"
        iconClassName="h-[18px] w-[18px]"
      />
    </section>
  );
}
