'use client';

import { useState } from 'react';
import { Play, Pause, Bookmark, Cast } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { handleCastClick } from '@/lib/cast-utils';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { getTrackLessonId } from '@/lib/player-track-actions';

export function MiniPlayer() {
  const { currentTrack, isPlaying, currentTime, duration, togglePlay, toggleMiniPlayer } = useAudioPlayer();

  const hasBookmark = useBookmarksStore((s) => s.hasBookmark);
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const locale = useLocale();

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const lessonId = getTrackLessonId(currentTrack);
  const isBookmarked = hasBookmark(lessonId);

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-50 safe-area-bottom">
        {/* Thin progress bar at very top -- Spotify style */}
        <div className="h-[2px] bg-[hsl(0,0%,24%)]">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>

        {/* Player bar */}
        <div className="bg-[hsl(var(--surface-elevated))] backdrop-blur-xl">
          <div className="flex items-center gap-3 px-3 py-2 cursor-pointer" onClick={toggleMiniPlayer}>
            {/* Artwork / Icon */}
            <div className="h-10 w-10 rounded-md bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">📖</span>
            </div>

            {/* Track info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-foreground" dir="rtl">
                {currentTrack.hebrewTitle || currentTrack.title}
              </p>
              <p className="text-xs text-muted-foreground truncate" dir="rtl">
                {currentTrack.seriesName}
              </p>
            </div>

            {/* Heart / Bookmark */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowBookmarkDialog(true);
              }}
              className={`p-2 transition-colors ${isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label={locale === 'he' ? 'סימניה' : 'Bookmark'}
            >
              <Bookmark className={`h-5 w-5 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>

            {/* Cast / broadcast */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleCastClick();
              }}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={locale === 'he' ? 'שדר' : 'Cast'}
            >
              <Cast className="h-4 w-4" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="p-1 text-foreground hover:scale-105 transition-transform"
              aria-label={isPlaying ? (locale === 'he' ? 'השהה' : 'Pause') : locale === 'he' ? 'נגן' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6 fill-current" />
              ) : (
                <Play className="h-6 w-6 fill-current ms-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bookmark dialog */}
      <BookmarkDialog
        isOpen={showBookmarkDialog}
        onClose={() => setShowBookmarkDialog(false)}
        lessonId={lessonId}
        position={currentTime}
        locale={locale}
      />
    </>
  );
}
