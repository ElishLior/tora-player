'use client';

import { Play, Pause, ChevronDown, Bookmark, Download, List, Cast } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from './seek-bar';
import { SpeedControl } from './speed-control';
import { handleCastClick } from '@/lib/cast-utils';

function Skip15Back({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5V1L7 5l5 4V5" />
      <path d="M19.07 7.93A8 8 0 1 1 7 5.3" />
      <text x="12" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="bold" fontFamily="system-ui">15</text>
    </svg>
  );
}

function Skip15Forward({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5V1l5 4-5 4V5" />
      <path d="M4.93 7.93A8 8 0 1 0 17 5.3" />
      <text x="12" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="bold" fontFamily="system-ui">15</text>
    </svg>
  );
}

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
    playbackSpeed,
    togglePlay,
    skipForward,
    skipBackward,
    seekTo,
    setPlaybackSpeed,
  } = useAudioPlayer();

  if (!currentTrack) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col safe-area-inset animate-slide-up"
      style={{
        background: 'linear-gradient(180deg, hsl(141 30% 12%) 0%, hsl(0 0% 7%) 40%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-full p-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close player"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
        <div className="text-center">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            {t('nowPlaying')}
          </p>
          {currentTrack.seriesName && (
            <p className="text-xs font-bold text-foreground" dir="rtl">
              {currentTrack.seriesName}
            </p>
          )}
        </div>
        <button className="rounded-full p-2 text-muted-foreground hover:text-foreground transition-colors">
          <List className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
        {/* Large artwork */}
        <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-xl shadow-2xl flex items-center justify-center overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, hsl(141 30% 18%) 0%, hsl(141 20% 8%) 100%)',
          }}
        >
          <div className="text-center space-y-3">
            <div className="text-7xl">📖</div>
            <p className="text-sm text-muted-foreground font-medium" dir="rtl">
              {currentTrack.seriesName || 'שיעור תורה'}
            </p>
          </div>
        </div>

        {/* Track info */}
        <div className="w-full max-w-md space-y-1">
          <h2 className="text-xl font-bold text-foreground truncate" dir="rtl">
            {currentTrack.hebrewTitle || currentTrack.title}
          </h2>
          <p className="text-sm text-muted-foreground" dir="rtl">
            {currentTrack.seriesName && (
              <span className="text-primary">{currentTrack.seriesName}</span>
            )}
            {currentTrack.date && currentTrack.seriesName && ' · '}
            {currentTrack.date}
          </p>
        </div>

        {/* Seek bar */}
        <div className="w-full max-w-md">
          <SeekBar currentTime={currentTime} duration={duration} onSeek={seekTo} />
        </div>

        {/* Main controls — dir="ltr" to prevent RTL from flipping arrows */}
        <div dir="ltr" className="flex items-center justify-center gap-6 w-full max-w-md">
          <SpeedControl speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />

          <button
            onClick={() => skipBackward(15)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('skipBackward')}
          >
            <Skip15Back className="h-8 w-8" />
          </button>

          <button
            onClick={togglePlay}
            className="rounded-full p-4 bg-foreground text-background hover:scale-105 transition-transform shadow-xl"
            aria-label={isPlaying ? t('pause') : t('play')}
          >
            {isPlaying ? (
              <Pause className="h-8 w-8 fill-current" />
            ) : (
              <Play className="h-8 w-8 fill-current ms-1" />
            )}
          </button>

          <button
            onClick={() => skipForward(15)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('skipForward')}
          >
            <Skip15Forward className="h-8 w-8" />
          </button>

          {/* Placeholder for symmetry */}
          <div className="w-10" />
        </div>

        {/* Secondary actions */}
        <div className="flex items-center justify-center gap-8 pt-2">
          <button className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <Bookmark className="h-5 w-5" />
            <span className="text-[10px]">{t('bookmark')}</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <Download className="h-5 w-5" />
            <span className="text-[10px]">{t('download')}</span>
          </button>
          <button
            onClick={() => handleCastClick()}
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cast"
          >
            <Cast className="h-5 w-5" />
            <span className="text-[10px]">{t('cast') || 'שדר'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
