'use client';

import { lessonPath } from '@/config/site';

import { useMemo } from 'react';
import { AudioLines, Check, ChevronLeft, ListChecks, ListPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { categoryLabel } from '@/lib/category-tree';
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
import { DateTile, LessonRow } from './lesson-row';
import type { LessonWithRelations } from '@/types/database';

export type LessonCardVariant = 'lesson' | 'short';

interface LessonCardProps {
  lesson: LessonWithRelations;
  /** lesson: date tile and one chip per part. short: rose accent tile and one length (shorts page). */
  variant?: LessonCardVariant;
  /** Bulk-select mode: the row is a toggle with a checkbox and has no links or play button. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  /** Replaces "play this lesson" when it is not the loaded one (shorts queue the list from this row). */
  onStart?: () => void;
}

const TILE = 'h-[58px] w-[52px] flex-shrink-0';

/*
 * Desktop affordances (lg and up, pointer devices only). The row's group is `lesson`
 * (see LessonRow). Only colour and opacity change, never a transform.
 */
// Full class names on purpose: Tailwind only generates utilities it finds as literal text in the source.
const TITLE_HOVER =
  'lg:[@media(hover:hover)]:group-hover/lesson:text-primary lg:[@media(hover:hover)]:group-hover/lesson:underline';
const TITLE_HOVER_SHORT =
  'lg:[@media(hover:hover)]:group-hover/lesson:text-rose-400 lg:[@media(hover:hover)]:group-hover/lesson:underline';
const PLAY_HOVER =
  'lg:[@media(hover:hover)]:group-hover/lesson:bg-primary lg:[@media(hover:hover)]:group-hover/lesson:text-[hsl(0_0%_7%)]';
const PLAY_HOVER_SHORT =
  'lg:[@media(hover:hover)]:group-hover/lesson:bg-rose-400 lg:[@media(hover:hover)]:group-hover/lesson:border-rose-400 lg:[@media(hover:hover)]:group-hover/lesson:text-[hsl(0_0%_7%)]';

/**
 * The one lesson row used by every list (lessons, categories, tags, search,
 * series, playlists, shorts) and by the home page's "שיעורים אחרונים": a date tile,
 * the title (stretched link), reading, one chip per part with its real length, tags,
 * a progress bar and a play button. Links sit beside the stretched link, never
 * inside it. Device-only state (progress, new, offline) renders after hydration.
 * The layout is LessonRow; this component only binds a lesson to it.
 */
export function LessonCard({
  lesson,
  variant = 'lesson',
  selectable,
  selected,
  onToggleSelect,
  onStart,
}: LessonCardProps) {
  const t = useTranslations('player');
  const locale = useLocale();
  const hydrated = useHydrated();
  const saved = useProgressStore((s) => s.progressMap[lesson.id]);
  const tracks = useMemo(() => getLessonTracks(lesson), [lesson]);
  const partSeconds = useMemo(() => getLessonPartSeconds(lesson), [lesson]);
  const previousVisitAt = useVisitStore((s) => s.previousVisitAt);
  const { isCurrent, playing } = useLessonPlayback(lesson.id);
  const hasTrack = useAudioStore((s) => s.currentTrack !== null);
  const isQueuedNext = useAudioStore((s) =>
    s.queue.some((track, index) => index > s.queueIndex && (track.lessonId || track.id) === lesson.id),
  );
  const isOffline = useIsDownloaded(lesson.id);
  const short = variant === 'short' && !selectable;

  // Device-only state: shown after hydration so the server HTML matches.
  const isHeard = hydrated && saved?.completed === true;
  const progress = hydrated && !isHeard ? Math.round(getListenedFraction(tracks, saved) * 100) : 0;
  const isNew = hydrated && !saved && isNewSince(lesson.created_at, previousVisitAt);
  const canPlayNext = hydrated && hasTrack && !isCurrent && tracks.length > 0 && !selectable;

  const hue = readingHue(lesson.parsha || lesson.id);
  const title = lesson.hebrew_title || lesson.title;
  const reading = lesson.parsha ? parshaLabel(lesson.parsha) : null;
  const hasOfflineDot = hydrated && isOffline;
  const hasBadges = !!(
    reading ||
    isHeard ||
    isNew ||
    hasOfflineDot ||
    lesson.part_number ||
    (selectable && lesson.category)
  );

  const dayMonth = hebrewDayMonth(lesson.hebrew_date);
  const dateTile = (
    <DateTile
      hue={hue}
      day={dayMonth?.day ?? lesson.date.slice(8, 10)}
      month={dayMonth?.month ?? lesson.date.slice(5, 7)}
    />
  );

  const tile = short ? (
    <span
      aria-hidden="true"
      className={cn('flex items-center justify-center rounded-xl bg-rose-400/15 text-rose-400', TILE)}
    >
      <AudioLines className="h-5 w-5" />
    </span>
  ) : selectable ? (
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
  );

  const titleNode = selectable ? (
    <span dir="auto" className="line-clamp-2">
      {title}
    </span>
  ) : (
    <Link
      href={lessonPath(lesson)}
      dir="auto"
      className={cn(
        "line-clamp-2 before:absolute before:inset-0 before:content-[''] focus-visible:outline-none",
        short ? (playing ? 'text-rose-400' : TITLE_HOVER_SHORT) : TITLE_HOVER,
      )}
    >
      {title}
    </Link>
  );

  const badges = hasBadges && (
    <>
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
          {categoryLabel(lesson.category, locale)}
        </span>
      )}
    </>
  );

  // A short's line shows its date link first; a lesson's shows only the badges (as before).
  const meta =
    short || hasBadges ? (
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
        {short && <LessonDateLink date={lesson.date} hebrewDate={lesson.hebrew_date} />}
        {badges}
      </p>
    ) : undefined;

  // Each part's real length; outside the stretched link so a clipped line can be swiped or focused.
  const parts = short ? (
    <PartDurations seconds={partSeconds} className="text-[13px] text-muted-foreground" />
  ) : (
    <PartDurations variant="chips" seconds={partSeconds} />
  );

  const progressBar =
    progress > 0 ? (
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
    ) : undefined;

  const actions = selectable ? (
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
        onStart={onStart}
        className={cn(
          'h-11 w-11',
          short
            ? `border border-rose-400/35 bg-transparent text-rose-400 hover:bg-rose-400/15 ${PLAY_HOVER_SHORT}`
            : `bg-[hsl(var(--surface-highlight))] text-foreground hover:bg-primary hover:text-primary-foreground ${PLAY_HOVER}`,
        )}
        iconClassName="h-4 w-4 translate-x-[6%] fill-current"
      />
      {/* The open cue at the inline end: decorative, hover devices only (it keeps its space there so the title does not shift). */}
      <ChevronLeft
        aria-hidden="true"
        className={cn(
          'hidden h-5 w-5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 motion-reduce:transition-none ltr:rotate-180',
          'lg:[@media(hover:hover)]:flex lg:[@media(hover:hover)]:group-hover/lesson:opacity-100',
        )}
      />
    </div>
  );

  if (selectable) {
    return (
      <LessonRow
        onClick={() => onToggleSelect?.(lesson.id)}
        className={cn(
          'cursor-pointer',
          selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-[hsl(var(--surface-elevated))]',
        )}
        tile={tile}
        title={titleNode}
        meta={meta}
        parts={parts}
        progress={progressBar}
        actions={actions}
      />
    );
  }

  return (
    <LessonRow
      tile={tile}
      title={titleNode}
      meta={meta}
      parts={parts}
      tags={<LessonTagList tags={lesson.tags} />}
      progress={progressBar}
      actions={actions}
    />
  );
}
