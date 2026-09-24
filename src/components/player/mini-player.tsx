'use client';

import { useState } from 'react';
import { Bookmark, Cast } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { audioEngine } from '@/lib/audio-engine';
import { handleCastClick, isCastableSource } from '@/lib/cast-utils';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { PlayPauseIcon } from './player-controls';
import { CastStatusMessage } from './cast-status';

export function MiniPlayer() {
  const t = useTranslations('player');
  const { currentTrack, currentTime, duration, transport, playbackIssue, togglePlay, toggleMiniPlayer } =
    useAudioPlayer();
  const lessonId = currentTrack ? getTrackLessonId(currentTrack) : '';
  const isBookmarked = useBookmarksStore((s) => s.bookmarks.some((b) => b.lessonId === lessonId));
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);

  if (!currentTrack) return null;

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  // Re-evaluated on every time update; offline (blob:) copies cannot be cast.
  const canCast = isCastableSource(audioEngine.getCurrentUrl());

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-50 safe-area-bottom">
        {/* Thin progress bar -- Spotify style; fills from the inline start */}
        <div className="h-[2px] bg-[hsl(0,0%,24%)]">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>

        <div className="bg-[hsl(var(--surface-elevated))] backdrop-blur-xl">
          <div className="flex items-center gap-3 px-3 py-2">
            {/* Opens the full player; the other controls sit beside it, never inside. */}
            <button
              type="button"
              data-player-expand
              onClick={toggleMiniPlayer}
              aria-label={`${currentTrack.hebrewTitle || currentTrack.title} · ${t('expandPlayer')}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-start"
            >
              <span className="h-10 w-10 rounded-md bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg" aria-hidden>📖</span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate text-foreground" dir="auto">
                  {currentTrack.hebrewTitle || currentTrack.title}
                </span>
                {playbackIssue ? (
                  <span className="block text-xs truncate text-amber-300">
                    {t(`issue.${playbackIssue}`)}
                  </span>
                ) : (
                  <span className="block text-xs text-muted-foreground truncate" dir="auto">
                    {currentTrack.seriesName}
                  </span>
                )}
              </span>
            </button>
            {/* Announces playback problems; text inside a button is not a live region. */}
            <p role="status" className="sr-only">
              {playbackIssue ? t(`issue.${playbackIssue}`) : ''}
            </p>

            <button
              type="button"
              onClick={() => setBookmarkPosition(currentTime)}
              className={`p-2 transition-colors ${isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label={t('bookmark')}
            >
              <Bookmark className={`h-5 w-5 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>

            {canCast && (
              <button
                type="button"
                onClick={() => void handleCastClick()}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('cast')}
              >
                <Cast className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={togglePlay}
              className="p-1 text-foreground hover:scale-105 transition-transform"
              aria-label={transport === 'paused' ? t('play') : t('pause')}
            >
              <PlayPauseIcon transport={transport} className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      <CastStatusMessage />

      {bookmarkPosition !== null && (
        <BookmarkDialog
          onClose={() => setBookmarkPosition(null)}
          lessonId={lessonId}
          audioFileId={currentTrack.audioFileId}
          position={bookmarkPosition}
        />
      )}
    </>
  );
}
