'use client';

import { Play, Pause, SkipForward, SkipBack, ChevronUp } from 'lucide-react';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { formatDuration } from '@/lib/utils';

export function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    skipForward,
    skipBackward,
    toggleMiniPlayer,
  } = useAudioPlayer();

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur-lg border-t safe-area-bottom">
      {/* Progress bar at top */}
      <div className="h-0.5 bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-2">
        {/* Track info */}
        <button
          onClick={toggleMiniPlayer}
          className="flex-1 min-w-0 text-start"
        >
          <p className="text-sm font-medium truncate" dir="rtl">
            {currentTrack.hebrewTitle || currentTrack.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {currentTrack.seriesName} · {formatDuration(Math.round(currentTime))}
          </p>
        </button>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => skipBackward(15)}
            className="rounded-full p-2 hover:bg-muted transition-colors"
            aria-label="Skip back 15 seconds"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          <button
            onClick={togglePlay}
            className="rounded-full p-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ms-0.5" />}
          </button>

          <button
            onClick={() => skipForward(15)}
            className="rounded-full p-2 hover:bg-muted transition-colors"
            aria-label="Skip forward 15 seconds"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Expand button */}
        <button
          onClick={toggleMiniPlayer}
          className="rounded-full p-2 hover:bg-muted transition-colors"
          aria-label="Expand player"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
