'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useHydrated } from '@/hooks/use-hydrated';
import { togglePlay } from '@/lib/audio-controller';
import { getResumePoint } from '@/lib/lesson-progress';
import { getLessonTracks } from '@/lib/lesson-tracks';
import { playLesson } from '@/lib/play-lesson';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { formatDuration } from '@/lib/utils';
import { getTransportState, useAudioStore } from '@/stores/audio-store';
import { useProgressStore } from '@/stores/progress-store';
import { PlayPauseIcon } from '@/components/player/player-controls';
import type { LessonWithRelations } from '@/types/database';

interface LatestLessonHeroProps {
  title: string;
  lesson: LessonWithRelations;
}

/** The newest lesson with a one-tap play that continues where the listener left it. */
export function LatestLessonHero({ title, lesson }: LatestLessonHeroProps) {
  const t = useTranslations('player');
  const hydrated = useHydrated();
  const tracks = useMemo(() => getLessonTracks(lesson), [lesson]);
  const saved = useProgressStore((s) => s.progressMap[lesson.id]);
  const isCurrent = useAudioStore((s) => !!s.currentTrack && getTrackLessonId(s.currentTrack) === lesson.id);
  const transport = useAudioStore((s) => getTransportState(s));

  if (tracks.length === 0) return null;

  // Device-only progress: shown after hydration so the server HTML matches.
  const resume = hydrated ? getResumePoint(tracks, saved) : { index: 0, position: 0 };
  const hasResume = resume.index > 0 || resume.position > 0;
  const showPause = hydrated && isCurrent && transport !== 'paused';
  const label = showPause
    ? t('pause')
    : isCurrent || !hasResume
      ? t('play')
      : tracks.length > 1
        ? t('resumePart', { number: resume.index + 1, time: formatDuration(resume.position) })
        : t('resumeAt', { time: formatDuration(resume.position) });
  const seriesName = lesson.series?.hebrew_name || lesson.series?.name;

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div
        className="flex items-center gap-4 rounded-xl p-4"
        style={{ background: 'linear-gradient(135deg, hsl(141 30% 18%) 0%, hsl(141 20% 10%) 100%)' }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          {seriesName && (
            <p className="truncate text-xs font-bold text-primary" dir="auto">
              {seriesName}
            </p>
          )}
          <Link
            href={`/lessons/${lesson.id}`}
            className="line-clamp-2 text-base font-bold text-foreground hover:underline"
            dir="auto"
          >
            {lesson.hebrew_title || lesson.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            <bdi>{lesson.hebrew_date || new Date(lesson.date).toLocaleDateString('he-IL')}</bdi>
            {lesson.duration > 0 && (
              <>
                {' · '}
                <bdi>{formatDuration(lesson.duration)}</bdi>
              </>
            )}
          </p>
          {hasResume && !isCurrent && <p className="text-xs text-primary">{label}</p>}
        </div>
        <button
          type="button"
          onClick={() => (isCurrent ? togglePlay() : playLesson(tracks))}
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
          aria-label={label}
        >
          <PlayPauseIcon transport={showPause ? transport : 'paused'} className="h-6 w-6" />
        </button>
      </div>
    </section>
  );
}
