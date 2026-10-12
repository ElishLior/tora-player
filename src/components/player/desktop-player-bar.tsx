'use client';

import { memo, useState } from 'react';
import { AudioLines, Bookmark, Cast, ChevronUp, ListMusic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { audioEngine } from '@/lib/audio-engine';
import { handleCastClick, isCastableSource } from '@/lib/cast-utils';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { cn } from '@/lib/utils';
import { useQueueNoticeText } from '@/hooks/use-queue-notice-text';
import { useAudioStore } from '@/stores/audio-store';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { PlayerShareButton } from './player-share-button';
import { SpeedControl } from './speed-control';
import { PlaybackTimeline, TransportControls, VolumeControl } from './transport-controls';
import { UpNextSheet } from './up-next';

const iconButton =
  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/**
 * Desktop now-playing bar (lg and up; phones keep MiniPlayer's bar). Three zones
 * in the page direction: the track (the one `data-player-expand` button, no links
 * inside), transport over the timeline in the middle, and the extras at the inline
 * end. Every control calls the store or the controller; the position is read only
 * by the timeline, so the bar does not re-render four times a second.
 */
export const DesktopPlayerBar = memo(function DesktopPlayerBar() {
  const t = useTranslations('player');
  const track = useAudioStore((s) => s.currentTrack);
  const playbackIssue = useAudioStore((s) => s.playbackIssue);
  const playbackSpeed = useAudioStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useAudioStore((s) => s.setPlaybackSpeed);
  const toggleMiniPlayer = useAudioStore((s) => s.toggleMiniPlayer);
  const upNextCount = useAudioStore((s) => Math.max(0, s.queue.length - s.queueIndex - 1));
  const lessonId = track ? getTrackLessonId(track) : '';
  const isBookmarked = useBookmarksStore((s) => s.bookmarks.some((b) => b.lessonId === lessonId));
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const queueNoticeText = useQueueNoticeText();
  // Offline (blob:) copies cannot be cast. Checked inside the selector, so it is re-read on every store
  // update (an offline copy can start loading after the track changed) and the bar re-renders only when it flips.
  const canCast = useAudioStore((s) => s.currentTrack !== null && isCastableSource(audioEngine.getCurrentUrl()));

  if (!track) return null;

  const title = track.hebrewTitle || track.title;

  // The bar is 96px (h-24, the layout's lg:pb-24 and the side menu's calc); the inset is added outside it.
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 hidden border-t border-[hsl(0,0%,16%)] bg-[hsl(var(--surface-elevated))] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:block">
        <div className="grid h-24 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] items-center gap-4 px-4 xl:px-6">
          <div className="flex min-w-0 items-center">
            <button
              type="button"
              data-player-expand
              onClick={toggleMiniPlayer}
              aria-label={`${title} · ${t('expandPlayer')}`}
              className="flex min-w-0 items-center gap-3 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-primary/30 to-primary/10">
                {track.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote lesson artwork outside the next/image config
                  <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <AudioLines aria-hidden="true" className="h-6 w-6 text-primary" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-foreground" dir="auto">
                  {title}
                </span>
                {playbackIssue ? (
                  <span className="block truncate text-[13px] text-amber-300">{t(`issue.${playbackIssue}`)}</span>
                ) : queueNoticeText ? (
                  <span className="block truncate text-[13px] text-muted-foreground" dir="auto">
                    {queueNoticeText}
                  </span>
                ) : (
                  track.seriesName && (
                    <span className="block truncate text-[13px] text-muted-foreground" dir="auto">
                      {track.seriesName}
                    </span>
                  )
                )}
              </span>
            </button>
            {/* Announces playback problems; text inside a button is not a live region. */}
            <p role="status" className="sr-only">
              {playbackIssue ? t(`issue.${playbackIssue}`) : (queueNoticeText ?? '')}
            </p>
          </div>

          <div className="flex min-w-0 flex-col items-center gap-1">
            <TransportControls />
            <PlaybackTimeline className="w-full max-w-2xl" />
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1">
            <VolumeControl className="hidden xl:flex" />
            <SpeedControl speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />
            <button
              type="button"
              onClick={() => setBookmarkPosition(useAudioStore.getState().currentTime)}
              aria-label={t('bookmark')}
              className={cn(iconButton, isBookmarked ? 'text-primary' : 'hover:text-foreground')}
            >
              <Bookmark className={cn('h-5 w-5', isBookmarked && 'fill-current')} aria-hidden="true" />
            </button>
            <PlayerShareButton compact />
            {canCast && (
              <button
                type="button"
                onClick={() => void handleCastClick()}
                aria-label={t('cast')}
                className={iconButton}
              >
                <Cast className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowUpNext(true)}
              aria-haspopup="dialog"
              aria-label={`${t('upNext')}${upNextCount > 0 ? ` (${upNextCount})` : ''}`}
              className={iconButton}
            >
              <ListMusic className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={toggleMiniPlayer} aria-label={t('expandPlayer')} className={iconButton}>
              <ChevronUp className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

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
});
