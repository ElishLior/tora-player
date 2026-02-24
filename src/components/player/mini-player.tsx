'use client';

import { Play, Pause, Heart, Cast } from 'lucide-react';
import { useAudioPlayer } from '@/hooks/use-audio-player';

export function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    toggleMiniPlayer,
  } = useAudioPlayer();

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 safe-area-bottom">
      {/* Thin progress bar at very top — Spotify style */}
      <div className="h-[2px] bg-[hsl(0,0%,24%)]">
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Player bar */}
      <div className="bg-[hsl(var(--surface-elevated))] backdrop-blur-xl">
        <div
          className="flex items-center gap-3 px-3 py-2 cursor-pointer"
          onClick={toggleMiniPlayer}
        >
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
            onClick={(e) => { e.stopPropagation(); }}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Bookmark"
          >
            <Heart className="h-5 w-5" />
          </button>

          {/* Cast / broadcast */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const w = window as any;
              if (w.cast?.framework) {
                w.cast.framework.CastContext.getInstance().requestSession().catch(() => {});
              } else {
                w['__onGCastApiAvailable'] = (ok: boolean) => {
                  if (ok) {
                    try {
                      const ctx = w.cast.framework.CastContext.getInstance();
                      ctx.setOptions({ receiverApplicationId: 'CC1AD845', autoJoinPolicy: 'ORIGIN_SCOPED' });
                      ctx.requestSession().catch(() => {});
                    } catch { /* */ }
                  }
                };
                const s = document.createElement('script');
                s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
                s.async = true;
                document.head.appendChild(s);
              }
            }}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cast"
          >
            <Cast className="h-4 w-4" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="p-1 text-foreground hover:scale-105 transition-transform"
            aria-label={isPlaying ? 'Pause' : 'Play'}
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
  );
}
