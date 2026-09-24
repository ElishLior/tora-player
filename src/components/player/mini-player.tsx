'use client';

import { useState } from 'react';
import { Bookmark, Cast } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { handleCastClick } from '@/lib/cast-utils';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { PlayPauseIcon } from './player-controls';

export function MiniPlayer() {
  const t = useTranslations('player');
  const { currentTrack, currentTime, duration, transport, playbackIssue, togglePlay, toggleMiniPlayer } =
    useAudioPlayer();
  const lessonId = currentTrack ? getTrackLessonId(currentTrack) : '';
  const isBookmarked = useBookmarksStore((s) => s.bookmarks.some((b) => b.lessonId === lessonId));
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);

  if (!currentTrack) return null;

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-50 safe-area-bottom">
        {/* Thin progress bar -- Spotify style; fills from the inline start */}
        <div className="h-[2px] bg-[hsl(0,0%,24%)]">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>

        <div className="bg-[hsl(var(--surface-elevated))] backdrop-blur-xl">
          <div className="flex items-center gap-3 px-3 py-2 cursor-pointer" onClick={toggleMiniPlayer}>
            <div className="h-10 w-10 rounded-md bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-lg" aria-hidden>📖</span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-foreground" dir="auto">
                {currentTrack.hebrewTitle || currentTrack.title}
              </p>
              {playbackIssue ? (
                <p role="status" className="text-xs truncate text-amber-300">
                  {t(`issue.${playbackIssue}`)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground truncate" dir="auto">
                  {currentTrack.seriesName}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBookmarkPosition(currentTime);
              }}
              className={`p-2 transition-colors ${isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label={t('bookmark')}
            >
              <Bookmark className={`h-5 w-5 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleCastClick();
              }}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('cast')}
            >
              <Cast className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="p-1 text-foreground hover:scale-105 transition-transform"
              aria-label={transport === 'paused' ? t('play') : t('pause')}
            >
              <PlayPauseIcon transport={transport} className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {bookmarkPosition !== null && (
        <BookmarkDialog
          onClose={() => setBookmarkPosition(null)}
          lessonId={lessonId}
          position={bookmarkPosition}
        />
      )}
    </>
  );
}
