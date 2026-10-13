'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { AudioLines, Bookmark, Play } from 'lucide-react';
import { ReadingCover } from '@/components/lessons/reading-cover';
import { useTranslations } from 'next-intl';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { LessonDateLink, LessonSeriesLink } from '@/components/lessons/lesson-browse-links';
import { PartDurations } from '@/components/lessons/part-durations';
import { lessonPath } from '@/config/site';
import { useHydrated } from '@/hooks/use-hydrated';
import { useLessonsByIds } from '@/hooks/use-lessons-by-ids';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Link } from '@/i18n/routing';
import { SHELL_PANE_SURFACE, SHELL_PANE_TOP, shellPaneHeight } from '@/lib/desktop-shell';
import { pickLastPlayed } from '@/lib/last-played';
import { getListenedFraction, getResumePoint } from '@/lib/lesson-progress';
import { getLessonPartSeconds, getLessonTracks } from '@/lib/lesson-tracks';
import { parshaLabel } from '@/lib/parsha-label';
import { playLesson } from '@/lib/play-lesson';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { cn } from '@/lib/utils';
import type { LessonWithRelations } from '@/types/database';
import { useAudioStore, type AudioTrack } from '@/stores/audio-store';
import { useProgressStore, type LocalProgress } from '@/stores/progress-store';
import { PlayerShareButton } from './player-share-button';
import { SpeedControl } from './speed-control';
import { PlaybackTimeline, TransportControls, VolumeControl } from './transport-controls';
import { UpNextSheet } from './up-next';
import { UpNextList } from './up-next-list';

/** How many upcoming items the panel lists before "show all" opens the sheet. */
const UP_NEXT_PREVIEW = 5;

/** The panel is a shell pane from xl (1280px) on every page; below that the bottom player and the feed carry playback. */
const WIDE = '(min-width: 1280px)';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
const skeletonBlock = 'animate-pulse rounded bg-[hsl(var(--surface-highlight))] motion-reduce:animate-none';

interface NowPlayingPanelProps {
  className?: string;
  /**
   * The latest published lesson (read once in the locale layout). Shown when nothing
   * is loaded and nothing was ever played on this device, so the panel is never empty.
   */
  fallbackLesson?: LessonWithRelations | null;
}

/**
 * The now-playing pane at the inline end of the desktop shell (xl and up, on every
 * page). Its content, in order:
 * - a track is loaded: the same session as the bottom desktop bar (store actions,
 *   the transport block, the up-next list);
 * - nothing loaded, something played before: the last-played lesson with its saved
 *   place and a Play button that resumes it (a user action, never autoplay);
 * - otherwise the latest published lesson ("השיעור האחרון") with its part chips;
 * - only when there are no lessons at all: an empty state.
 *
 * Playback changes only through the store and the controller actions. The pane is
 * sticky and scrolls its own content (see desktop-shell.ts for the geometry).
 */
export function NowPlayingPanel({ className, fallbackLesson = null }: NowPlayingPanelProps) {
  const t = useTranslations('player');
  const tDesktop = useTranslations('desktopPlayer');
  const hydrated = useHydrated();
  const wide = useMediaQuery(WIDE);
  const hasTrack = useAudioStore((s) => s.currentTrack !== null);

  // Device-only state (the loaded track, saved progress) renders after hydration, so the server HTML matches.
  // Below xl the pane is not displayed, so it does not fetch lessons there either.
  return (
    <aside
      aria-label={tDesktop('panelLabel')}
      data-now-playing-panel
      className={cn(
        'hidden self-start overflow-y-auto overscroll-contain xl:sticky xl:flex xl:w-80 xl:flex-col xl:gap-4 xl:p-4 min-[1800px]:w-[360px]',
        SHELL_PANE_TOP,
        SHELL_PANE_SURFACE,
        shellPaneHeight(hasTrack, 'sticky'),
        className,
      )}
    >
      {hydrated && wide ? <PanelBody fallbackLesson={fallbackLesson} /> : <PanelSkeleton label={t('nowPlaying')} />}
    </aside>
  );
}

function PanelBody({ fallbackLesson }: { fallbackLesson: LessonWithRelations | null }) {
  const track = useAudioStore((s) => s.currentTrack);
  return track ? <LoadedPanel track={track} /> : <LastPlayedPanel fallbackLesson={fallbackLesson} />;
}

function Artwork({ url, lesson }: { url?: string | null; lesson?: LessonWithRelations | null }) {
  // No picture: the lesson's reading cover, like the home hero; the generic mark only without lesson data.
  if (!url && lesson) {
    return <ReadingCover lesson={lesson} className="aspect-[16/10] w-full rounded-xl" textClassName="text-5xl" />;
  }
  return (
    <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/30 to-primary/10">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote lesson artwork outside the next/image config; the title is beside it
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <AudioLines aria-hidden="true" className="h-12 w-12 text-primary" />
      )}
    </div>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <div aria-hidden="true" className={cn('aspect-[16/10] w-full rounded-xl', skeletonBlock)} />
      <div aria-hidden="true" className={cn('h-5 w-3/4', skeletonBlock)} />
      <div aria-hidden="true" className={cn('h-3 w-1/2', skeletonBlock)} />
    </div>
  );
}

function LoadedPanel({ track }: { track: AudioTrack }) {
  const t = useTranslations('player');
  const lessonId = getTrackLessonId(track);
  const { lessons } = useLessonsByIds([lessonId]);
  const lesson = lessons.get(lessonId);
  const upNextCount = useAudioStore((s) => Math.max(0, s.queue.length - s.queueIndex - 1));
  const playbackSpeed = useAudioStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useAudioStore((s) => s.setPlaybackSpeed);
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const queueRef = useRef<HTMLDivElement>(null);
  const upNextId = useId();

  const title = track.hebrewTitle || track.title;
  const reading = lesson?.parsha ? parshaLabel(lesson.parsha) : null;
  const partLabel =
    track.partIndex !== undefined && track.partCount && track.partCount > 1
      ? t('partOf', { number: track.partIndex + 1, count: track.partCount })
      : null;
  const detail = [reading, partLabel].filter(Boolean).join(' · ');

  return (
    <>
      <Artwork url={track.artworkUrl} lesson={lesson} />

      <div className="space-y-1">
        <h2 className="text-lg font-bold leading-snug" dir="auto">
          {/* Opens the lesson page; the links beside it (series, date) are siblings, never nested. */}
          <Link
            href={lessonPath({ id: lessonId, slug: track.lessonSlug })}
            className={cn('rounded-sm hover:underline', focusRing)}
          >
            {title}
          </Link>
        </h2>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
          {track.seriesName &&
            (track.seriesId ? (
              <LessonSeriesLink seriesId={track.seriesId} name={track.seriesName} className="text-primary" />
            ) : (
              <span className="text-primary" dir="auto">
                {track.seriesName}
              </span>
            ))}
          {track.seriesName && track.date && <span aria-hidden="true">·</span>}
          {track.date && <LessonDateLink date={track.date} hebrewDate={lesson?.hebrew_date} className="text-[13px]" />}
        </p>
        {detail && (
          <p className="text-[13px] text-muted-foreground" dir="rtl">
            {detail}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <TransportControls />
        <PlaybackTimeline />
      </div>

      <div className="flex items-center gap-1">
        <SpeedControl speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setBookmarkPosition(useAudioStore.getState().currentTime)}
          aria-label={t('bookmark')}
          className={cn(
            'flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground',
            focusRing,
          )}
        >
          <Bookmark className="h-5 w-5" aria-hidden="true" />
        </button>
        <PlayerShareButton compact />
      </div>
      <VolumeControl className="w-full" />

      <section aria-labelledby={upNextId} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id={upNextId} className="text-[15px] font-bold">
            {t('upNext')}
          </h3>
          {upNextCount > UP_NEXT_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowUpNext(true)}
              aria-haspopup="dialog"
              className={cn('rounded-sm text-[13px] text-primary hover:underline', focusRing)}
            >
              {t('showAllUpNext', { count: upNextCount })}
            </button>
          )}
        </div>
        {/* Receives focus when a row that held it is removed or moved to an edge. */}
        <div ref={queueRef} tabIndex={-1} className="outline-none">
          <UpNextList limit={UP_NEXT_PREVIEW} focusFallback={queueRef} />
        </div>
      </section>

      {bookmarkPosition !== null && (
        <BookmarkDialog
          onClose={() => setBookmarkPosition(null)}
          lessonId={lessonId}
          audioFileId={track.audioFileId}
          position={bookmarkPosition}
        />
      )}
      {showUpNext && <UpNextSheet onClose={() => setShowUpNext(false)} />}
    </>
  );
}

/**
 * Nothing loaded. The last-played lesson (not heard to the end, else the most recent)
 * with its saved place; when nothing was played on this device, or its lesson is gone,
 * the latest published lesson. Both resume only on a button press, never on their own.
 */
function LastPlayedPanel({ fallbackLesson }: { fallbackLesson: LessonWithRelations | null }) {
  const tDesktop = useTranslations('desktopPlayer');
  const progressMap = useProgressStore((s) => s.progressMap);
  const entry = useMemo(() => pickLastPlayed(progressMap), [progressMap]);
  const lessonId = entry?.lessonId ?? '';
  const { lessons, settled } = useLessonsByIds(lessonId ? [lessonId] : []);
  const playedLesson = lessonId ? lessons.get(lessonId) : undefined;

  if (entry && !playedLesson && !settled) return <PanelSkeleton label={tDesktop('lastPlayed')} />;

  if (entry && playedLesson) return <LessonPanelView lesson={playedLesson} played={entry} />;
  if (fallbackLesson) return <LessonPanelView lesson={fallbackLesson} />;
  return <EmptyPanel />;
}

/**
 * One lesson in the panel: artwork, title, date, reading and part, then its parts as
 * chips and a Play button. With `played` (the device's saved place) it shows the
 * last-played heading, progress and a resume button; without it the latest lesson.
 */
function LessonPanelView({ lesson, played }: { lesson: LessonWithRelations; played?: LocalProgress }) {
  const t = useTranslations('player');
  const tDesktop = useTranslations('desktopPlayer');
  const tHome = useTranslations('home');
  const tracks = useMemo(() => getLessonTracks(lesson), [lesson]);
  const partSeconds = useMemo(() => getLessonPartSeconds(lesson), [lesson]);
  const resume = played ? getResumePoint(tracks, played) : null;
  const percent = played ? (played.completed ? 100 : Math.round(getListenedFraction(tracks, played) * 100)) : 0;
  const reading = lesson.parsha ? parshaLabel(lesson.parsha) : null;
  const partLabel =
    resume && tracks.length > 1 ? t('partOf', { number: resume.index + 1, count: tracks.length }) : null;
  const detail = [reading, partLabel].filter(Boolean).join(' · ');
  const name = lesson.hebrew_title || lesson.title;

  return (
    <>
      <p className="text-[13px] font-semibold text-primary">
        {played ? tDesktop('lastPlayed') : tHome('latestLesson')}
      </p>
      <Artwork lesson={lesson} />

      <div className="space-y-1">
        <h2 className="text-lg font-bold leading-snug" dir="auto">
          <Link href={lessonPath(lesson)} className={cn('rounded-sm hover:underline', focusRing)}>
            {name}
          </Link>
        </h2>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
          <LessonDateLink date={lesson.date} hebrewDate={lesson.hebrew_date} className="text-[13px]" />
        </p>
        {detail && (
          <p className="text-[13px] text-muted-foreground" dir="rtl">
            {detail}
          </p>
        )}
      </div>

      {/* Each chip starts its own part (the saved place is only for the resume button). */}
      <PartDurations
        variant="chips"
        seconds={partSeconds}
        onPlayPart={(index) => playLesson(tracks, { startPart: index })}
      />

      {percent > 0 && (
        <span
          className="bg-foreground/12 block h-[3px] overflow-hidden rounded-full"
          role="progressbar"
          aria-label={name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </span>
      )}

      <button
        type="button"
        onClick={() => playLesson(tracks)}
        disabled={tracks.length === 0}
        className={cn(
          'flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40',
          focusRing,
        )}
      >
        <Play aria-hidden="true" className="h-4 w-4 translate-x-[6%] fill-current" />
        {played ? tDesktop('resume') : t('play')}
      </button>
    </>
  );
}

function EmptyPanel() {
  const t = useTranslations('desktopPlayer');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
      <AudioLines aria-hidden="true" className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-[15px] font-bold">{t('nothingPlayedTitle')}</p>
      <p className="text-[13px] text-muted-foreground">{t('nothingPlayedHint')}</p>
    </div>
  );
}
