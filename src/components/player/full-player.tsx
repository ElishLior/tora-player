'use client';

import { Play, Pause, SkipForward, SkipBack, ChevronDown, Volume2, Bookmark, Share2, Download, List } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from './seek-bar';
import { SpeedControl } from './speed-control';

interface FullPlayerProps {
  onClose: () => void;
}

export function FullPlayer({ onClose }: FullPlayerProps) {
  const t = useTranslations('player');
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackSpeed,
    togglePlay,
    skipForward,
    skipBackward,
    seekTo,
    setVolume,
    setPlaybackSpeed,
  } = useAudioPlayer();

  if (!currentTrack) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col safe-area-inset">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-full p-2 hover:bg-muted transition-colors"
          aria-label="Close player"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium">{t('nowPlaying')}</span>
        <button className="rounded-full p-2 hover:bg-muted transition-colors">
          <List className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {/* Artwork placeholder */}
        <div className="w-64 h-64 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shadow-lg">
          <div className="text-6xl">📖</div>
        </div>

        {/* Track info */}
        <div className="w-full text-center space-y-1">
          <h2 className="text-xl font-bold" dir="rtl">
            {currentTrack.hebrewTitle || currentTrack.title}
          </h2>
          {currentTrack.seriesName && (
            <p className="text-muted-foreground" dir="rtl">
              {currentTrack.seriesName}
            </p>
          )}
          <p className="text-sm text-muted-foreground">{currentTrack.date}</p>
        </div>

        {/* Seek bar */}
        <div className="w-full max-w-md">
          <SeekBar currentTime={currentTime} duration={duration} onSeek={seekTo} />
        </div>

        {/* Main controls */}
        <div className="flex items-center gap-6">
          <SpeedControl speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />

          <button
            onClick={() => skipBackward(15)}
            className="rounded-full p-3 hover:bg-muted transition-colors"
            aria-label={t('skipBackward')}
          >
            <SkipBack className="h-6 w-6" />
          </button>

          <button
            onClick={togglePlay}
            className="rounded-full p-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg"
            aria-label={isPlaying ? t('pause') : t('play')}
          >
            {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8 ms-1" />}
          </button>

          <button
            onClick={() => skipForward(15)}
            className="rounded-full p-3 hover:bg-muted transition-colors"
            aria-label={t('skipForward')}
          >
            <SkipForward className="h-6 w-6" />
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setVolume(volume === 0 ? 1 : 0)}
              className="rounded-full p-2 hover:bg-muted transition-colors"
              aria-label={t('volume')}
            >
              <Volume2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Secondary actions */}
        <div className="flex items-center gap-6">
          <button className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            <Bookmark className="h-5 w-5" />
            <span className="text-xs">{t('bookmark')}</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            <Download className="h-5 w-5" />
            <span className="text-xs">{t('download')}</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            <Share2 className="h-5 w-5" />
            <span className="text-xs">{t('cast')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
