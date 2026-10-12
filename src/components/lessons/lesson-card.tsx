'use client';

import { lessonPath } from '@/config/site';

import { useMemo } from 'react';
import { Check, ListChecks, ListPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { parshaLabel } from '@/lib/parsha-label';
import { hebrewDayMonth, readingHue } from '@/lib/lesson-display';
import { useAudioStore } from '@/stores/audio-store';
import { useProgressStore } from '@/stores/progress-store';
import { isNewSince, useVisitStore } from '@/stores/visit-store';
import { useIsDownloaded } from '@/hooks/use-offline';
import { useHydrated } from '@/hooks/use-hydrated';
import { getLessonPartSeconds, getLessonTracks } from '@/lib/lesson-tracks';
import { getListenedFraction } from '@/lib/lesson-progress';
import { cn } from '@/lib/utils';
import { LessonPlayButton, useLessonPlayback } from './lesson-play-button';
import { LessonDateLink, LessonTagList } from './lesson-browse-links';
import { PartDurations } from './part-durations';
import type { LessonWithRelations } from '@/types/database';

interface LessonCardProps {
  lesson: LessonWithRelations;
  /** Bulk-select mode: the row is a toggle with a checkbox and has no links or play button. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const TILE = 'h-[58px] w-[52px] flex-shrink-0';

/**
 * The one lesson row used by every list (lessons, categories, tags, search,
 * series, playlists) and by the home page's "שיעורים אחרונים": a date tile, the
 * title (stretched link), reading, one chip per part with its real length, tags,
 * a progress bar and a play button. Links sit beside the stretched link, never
 * inside it. Device-only state (progress, new, offline) renders after hydration.
 */
export function LessonCard({ lesson, selectable, selected, onToggleSelect }: LessonCardProps) {
  const t = useTranslations('player');
  const hydrated = useHydrated();
  const saved = useProgressStore((s) => s.progressMap[lesson.id]);
  const tracks = useMemo(() => getLessonTracks(lesson), [lesson]);
  const partSeconds = useMemo(() => getLessonPartSeconds(lesson), [lesson]);
  const previousVisitAt = useVisitStore((s) => s.previousVisitAt);
  const { isCurrent } = useLessonPlayback(lesson.id);
  const hasTrack = useAudioStore((s) => s.currentTrack !== null);
  const isQueuedNext = useAudioStore((s) =>
    s.queue.some((track, index) => index > s.queueIndex && (track.lessonId || track.id) === lesson.id),
  );
  const isOffline = useIsDownloaded(lesson.id);

  // Device-only state: shown after hydration so the server HTML matches.
  const isHeard = hydrated && saved?.completed === true;
  const progress = hydrated && !isHeard ? Math.round(getListenedFraction(tracks, saved) * 100) : 0;
  const isNew = hydrated && !saved && isNewSince(lesson.created_at, previousVisitAt);
  const canPlayNext = hydrated && hasTrack && !isCurrent && tracks.length > 0 && !selectable;

  const hue = readingHue(lesson.parsha || lesson.id);
  const title = lesson.hebrew_title || lesson.title;
  const reading = lesson.parsha ? parshaLabel(lesson.parsha) : null;
  const hasOfflineDot = hydrated && isOffline;
  const hasMeta = !!(
    reading ||
    isHeard ||
    isNew ||
    hasOfflineDot ||
    lesson.part_number ||
    (selectable && lesson.category)
  );

  const dateTile = (
    <span
      className="flex h-full w-full flex-col items-center justify-center rounded-xl border text-center"
      style={{
        background: `linear-gradient(150deg, hsl(${hue} 40% 24%), hsl(${hue} 25% 14%))`,
        borderColor: `hsl(${hue} 40% 40% / 0.35)`,
      }}
    >
      <DateTileText lesson={lesson} hue={hue} />
    </span>
  );

  const body = (
    <>
      {selectable ? (
        <span className={cn('flex items-center justify-center', TILE)}>{dateTile}</span>
      ) : (
        /* The tile is the date link: a sibling of the title link, never nested. */
        <LessonDateLink
          date={lesson.date}
          hebrewDate={lesson.hebrew_date}
          className={cn(TILE, 'flex-col justify-center gap-0.5 rounded-xl px-0 hover:no-underline')}
        >
          {dateTile}
        </LessonDateLink>
      )}

      <div className="grid min-w-0 flex-1 gap-1.5">
        <h3 className="text-base font-bold leading-snug text-foreground">
          {selectable ? (
            <span dir="auto" className="line-clamp-2">
              {title}
            </span>
          ) : (
            <Link
              href={lessonPath(lesson)}
              dir="auto"
              className="line-clamp-2 before:absolute before:inset-0 before:content-[''] focus-visible:outline-none"
            >
              {title}
            </Link>
          )}
        </h3>

        {hasMeta && (
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
            {reading && (
              <span className="truncate font-semibold" dir="rtl" style={{ color: `hsl(${hue} 65% 74%)` }}>
                {reading}
              </span>
            )}
            {isHeard && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-primary">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                {t('heard')}
              </span>
            )}
            {isNew && (
              <span className="flex-shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                {t('newBadge')}
              </span>
            )}
            {hasOfflineDot && (
              <span
                role="img"
                aria-label={t('downloaded')}
                title={t('downloaded')}
                className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500"
              />
            )}
            {lesson.part_number && (
              <span className="flex-shrink-0 rounded-full bg-[hsl(var(--surface-highlight))] px-2 py-0.5 text-[11px]">
                {lesson.part_number}
              </span>
            )}
            {selectable && lesson.category && (
              <span
                className="max-w-[120px] truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary/80"
                dir="rtl"
              >
                {lesson.category.hebrew_name}
              </span>
            )}
          </p>
        )}

        {/* Each part's real length; outside the stretched link so a clipped line can be swiped or focused. */}
        <PartDurations variant="chips" seconds={partSeconds} />

        {!selectable && <LessonTagList tags={lesson.tags} />}

        {progress > 0 && (
          <span
            className="bg-foreground/12 block h-[3px] max-w-[260px] overflow-hidden rounded-full"
            role="progressbar"
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>

      {selectable ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex h-6 w-6 flex-shrink-0 items-center justify-center self-center rounded border-2 transition-colors',
            selected ? 'border-primary bg-primary' : 'border-muted-foreground/50',
          )}
        >
          {selected && <Check className="h-4 w-4 text-primary-foreground" />}
        </span>
      ) : (
        <div className="flex flex-shrink-0 items-center gap-1 self-center">
          {canPlayNext && (
            <button
              type="button"
              onClick={() => useAudioStore.getState().playNext(tracks)}
              disabled={isQueuedNext}
              className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:text-primary"
              aria-label={isQueuedNext ? t('queuedNext') : t('playNext')}
              title={isQueuedNext ? t('queuedNext') : t('playNext')}
            >
              {isQueuedNext ? <ListChecks className="h-4 w-4" /> : <ListPlus className="h-4 w-4" />}
            </button>
          )}
          <LessonPlayButton
            lessonId={lesson.id}
            tracks={tracks}
            playLabel={t('play')}
            pauseLabel={t('pause')}
            className="h-11 w-11 bg-[hsl(var(--surface-highlight))] text-foreground hover:bg-primary hover:text-primary-foreground"
            iconClassName="h-4 w-4 translate-x-[6%] fill-current"
          />
        </div>
      )}
    </>
  );

  const rowClass =
    'group relative flex items-center gap-3 rounded-2xl p-2.5 transition-colors duration-150 motion-reduce:transition-none sm:p-3';

  if (selectable) {
    return (
      <div
        onClick={() => onToggleSelect?.(lesson.id)}
        className={cn(
          rowClass,
          'cursor-pointer',
          selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-[hsl(var(--surface-elevated))]',
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <article
      className={cn(
        rowClass,
        'hover:bg-[hsl(var(--surface-elevated))] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary/50',
      )}
    >
      {body}
    </article>
  );
}

/** Day and month inside the tile: Hebrew from the stored Hebrew date, else the stored date's digits. */
function DateTileText({ lesson, hue }: { lesson: LessonWithRelations; hue: number }) {
  const dayMonth = hebrewDayMonth(lesson.hebrew_date);
  return (
    <>
      <b className="text-[19px] leading-none" style={{ color: `hsl(${hue} 75% 82%)` }}>
        {dayMonth?.day ?? lesson.date.slice(8, 10)}
      </b>
      <span className="text-[13px] leading-tight" style={{ color: `hsl(${hue} 30% 74%)` }}>
        {dayMonth?.month ?? lesson.date.slice(5, 7)}
      </span>
    </>
  );
}
