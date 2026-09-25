'use client';

import { useMemo } from 'react';
import { Check, ListChecks, ListPlus, Play, Pause } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Link } from '@/i18n/routing';
import { formatDuration } from '@/lib/utils';
import { useAudioStore } from '@/stores/audio-store';
import { useProgressStore } from '@/stores/progress-store';
import { isNewSince, useVisitStore } from '@/stores/visit-store';
import { useIsDownloaded } from '@/hooks/use-offline';
import { useHydrated } from '@/hooks/use-hydrated';
import { getLessonTracks } from '@/lib/lesson-tracks';
import { getListenedFraction } from '@/lib/lesson-progress';
import { playLesson } from '@/lib/play-lesson';
import type { LessonWithRelations } from '@/types/database';

interface LessonCardProps {
  lesson: LessonWithRelations;
  showProgress?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function LessonCard({ lesson, showProgress, selectable, selected, onToggleSelect }: LessonCardProps) {
  const t = useTranslations('player');
  const router = useRouter();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const hydrated = useHydrated();
  const saved = useProgressStore((s) => s.progressMap[lesson.id]);
  const tracks = useMemo(() => getLessonTracks(lesson), [lesson]);
  const previousVisitAt = useVisitStore((s) => s.previousVisitAt);
  const isQueuedNext = useAudioStore((s) =>
    s.queue.some((track, index) => index > s.queueIndex && (track.lessonId || track.id) === lesson.id),
  );

  const isCurrentlyPlaying = currentTrack?.id === lesson.id;
  const isOffline = useIsDownloaded(lesson.id);

  // Device-only progress: shown after hydration so the server HTML matches.
  const progress = hydrated ? saved : undefined;
  const isHeard = progress?.completed === true;
  const progressPercent = isHeard ? 0 : Math.round(getListenedFraction(tracks, progress) * 100);
  // Device-only too: created since the previous visit and not started here yet.
  const isNew = hydrated && !saved && isNewSince(lesson.created_at, previousVisitAt);
  const canPlayNext = hydrated && !!currentTrack && !isCurrentlyPlaying && tracks.length > 0;

  const handlePlayNext = () => {
    useAudioStore.getState().playNext(tracks);
  };

  const handlePlay = () => {
    if (isCurrentlyPlaying && isPlaying) {
      // Pause — stay on current page
      togglePlay();
      return;
    }

    if (isCurrentlyPlaying && !isPlaying) {
      // Resume paused track — resume + navigate to lesson
      togglePlay();
      router.push(`/lessons/${lesson.id}`);
      return;
    }

    // New lesson — continue where the listener left it, then open its page
    if (tracks.length === 0) return;
    playLesson(tracks);
    router.push(`/lessons/${lesson.id}`);
  };

  const infoContent = (
    <>
      <h3 className={`text-sm font-semibold truncate ${
        isCurrentlyPlaying && !selectable ? 'text-primary' : 'text-foreground'
      }`} dir="rtl">
        {lesson.hebrew_title || lesson.title}
      </h3>
      <p className="text-xs text-muted-foreground truncate mt-0.5" dir="rtl">
        {lesson.parsha && <span className="text-primary/80">{lesson.parsha}</span>}
        {lesson.parsha && ' · '}
        {lesson.hebrew_date || new Date(lesson.date).toLocaleDateString('he-IL')}
        {lesson.duration > 0 && ` · ${formatDuration(lesson.duration)}`}
      </p>
    </>
  );

  const cardContent = (
    <>
      <div className="flex items-center gap-3">
        {selectable ? (
          /* Checkbox for selection mode */
          <div className="flex-shrink-0 h-10 w-10 rounded-md bg-[hsl(var(--surface-elevated))] flex items-center justify-center">
            <div
              className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                selected
                  ? 'bg-primary border-primary'
                  : 'border-muted-foreground/50'
              }`}
            >
              {selected && (
                <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </div>
          </div>
        ) : (
          /* Play button / Equalizer */
          <button
            type="button"
            onClick={handlePlay}
            className="relative z-10 flex-shrink-0 h-10 w-10 rounded-md bg-[hsl(var(--surface-elevated))] flex items-center justify-center transition-all group-hover:bg-primary group-hover:shadow-lg group-hover:shadow-primary/25"
            aria-label={t('play')}
          >
            {isCurrentlyPlaying && isPlaying ? (
              <div className="flex items-center gap-[2px] group-hover:hidden">
                <div className="equalizer-bar bg-primary h-3" />
                <div className="equalizer-bar bg-primary h-3" />
                <div className="equalizer-bar bg-primary h-3" />
              </div>
            ) : null}
            {isCurrentlyPlaying && isPlaying ? (
              <Pause className="h-4 w-4 text-primary-foreground hidden group-hover:block" />
            ) : (
              <Play className="h-4 w-4 ms-0.5 text-muted-foreground group-hover:text-primary-foreground" />
            )}
          </button>
        )}

        {/* The lesson link covers the card, but never wraps the play or queue buttons. */}
        {selectable ? (
          <div className="flex-1 min-w-0">{infoContent}</div>
        ) : (
          <Link
            href={`/lessons/${lesson.id}`}
            className="flex-1 min-w-0 before:absolute before:inset-0 before:content-['']"
          >
            {infoContent}
          </Link>
        )}

        {/* Category badge (show in selection mode) */}
        {selectable && lesson.category && (
          <span className="text-[10px] text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0 truncate max-w-[100px]" dir="rtl">
            {lesson.category.hebrew_name}
          </span>
        )}

        {/* New since the previous visit */}
        {isNew && !selectable && (
          <span className="flex-shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            {t('newBadge')}
          </span>
        )}

        {/* Part badge */}
        {lesson.part_number && !selectable && (
          <span className="text-[10px] text-muted-foreground bg-[hsl(var(--surface-elevated))] px-2 py-0.5 rounded-full flex-shrink-0">
            {lesson.part_number}
          </span>
        )}

        {/* Offline badge */}
        {isOffline && !selectable && (
          <span className="flex-shrink-0 h-2 w-2 rounded-full bg-green-500" title={t('downloaded')} />
        )}

        {/* Heard to the end */}
        {isHeard && !selectable && (
          <Check className="h-4 w-4 flex-shrink-0 text-primary" aria-label={t('heard')} />
        )}

        {/* Queue after the current track */}
        {canPlayNext && !selectable && (
          <button
            type="button"
            onClick={handlePlayNext}
            disabled={isQueuedNext}
            className="relative z-10 flex-shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:text-primary"
            aria-label={isQueuedNext ? t('queuedNext') : t('playNext')}
            title={isQueuedNext ? t('queuedNext') : t('playNext')}
          >
            {isQueuedNext ? <ListChecks className="h-4 w-4" /> : <ListPlus className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {showProgress && !selectable && progressPercent > 0 && (
        <div className="mt-2 ms-[52px] h-0.5 w-auto overflow-hidden rounded-full bg-[hsl(0,0%,24%)]">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </>
  );

  if (selectable) {
    return (
      <div
        onClick={() => onToggleSelect?.(lesson.id)}
        className={`group block rounded-lg p-3 transition-all cursor-pointer ${
          selected
            ? 'bg-primary/10 ring-1 ring-primary/30'
            : 'hover:bg-[hsl(var(--surface-highlight))]'
        }`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div className="group relative block rounded-lg p-3 transition-all hover:bg-[hsl(var(--surface-highlight))]">
      {cardContent}
    </div>
  );
}
