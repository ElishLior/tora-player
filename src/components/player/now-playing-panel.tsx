'use client';

import { useId, useRef, useState } from 'react';
import { AudioLines, Bookmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { LessonDateLink, LessonSeriesLink } from '@/components/lessons/lesson-browse-links';
import { lessonPath } from '@/config/site';
import { useHydrated } from '@/hooks/use-hydrated';
import { Link } from '@/i18n/routing';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { cn } from '@/lib/utils';
import { useAudioStore } from '@/stores/audio-store';
import { PlayerShareButton } from './player-share-button';
import { UpNextSheet } from './up-next';
import { UpNextList } from './up-next-list';

/** How many upcoming items the panel lists before "show all" opens the sheet. */
const UP_NEXT_PREVIEW = 5;

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/**
 * Desktop "now playing / up next" column. Renders nothing without a loaded
 * track. Playback changes only through the store and the controller actions
 * (`playTrack`, store queue edits via `UpNextList`), never the audio element.
 *
 * Sticky inside its column: the caller's column must be the full height of the
 * page row (a flex child that stretches), and `className` may override the defaults.
 */
export function NowPlayingPanel({ className }: { className?: string }) {
  const t = useTranslations('player');
  const hydrated = useHydrated();
  const track = useAudioStore((s) => s.currentTrack);
  const upNextCount = useAudioStore((s) => Math.max(0, s.queue.length - s.queueIndex - 1));
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const queueRef = useRef<HTMLDivElement>(null);
  const upNextId = useId();

  // The current track is persisted, so the server HTML (no track) must match the first client render.
  if (!hydrated || !track) return null;

  const lessonId = getTrackLessonId(track);
  const title = track.hebrewTitle || track.title;

  return (
    <aside
      aria-label={t('nowPlaying')}
      className={cn(
        'sticky top-16 flex max-h-[calc(100dvh-8rem)] flex-col gap-4 overflow-y-auto overscroll-contain rounded-2xl bg-[hsl(var(--surface-elevated))] p-4',
        className,
      )}
    >
      <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/30 to-primary/10">
        {track.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote lesson artwork outside the next/image config; the title is beside it
          <img src={track.artworkUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <AudioLines aria-hidden="true" className="h-12 w-12 text-primary" />
        )}
      </div>

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
          {track.date && <LessonDateLink date={track.date} className="text-[13px]" />}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <PlayerShareButton compact />
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
      </div>

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
    </aside>
  );
}
