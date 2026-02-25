'use client';

import { useState } from 'react';
import { Play, Pause, ChevronDown, Bookmark, Download, List, Cast, Car, Scissors } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from './seek-bar';
import { SpeedControl } from './speed-control';
import { handleCastClick } from '@/lib/cast-utils';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { getTagInfo } from '@/components/bookmarks/bookmark-dialog';
import { ShareClipDialog } from '@/components/player/share-clip-dialog';

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

  const locale = useLocale();
  const router = useRouter();
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [showShareClipDialog, setShowShareClipDialog] = useState(false);

  if (!currentTrack) return null;

  const lessonBookmarks = bookmarks.filter((b) => b.lessonId === currentTrack.id);
  const bookmarkCount = lessonBookmarks.length;

  // Tag color map for bookmark markers
  const tagColorMap: Record<string, string> = {
    important: 'bg-red-400',
    review: 'bg-amber-400',
    quote: 'bg-blue-400',
    question: 'bg-purple-400',
  };

  return (
    <>
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

          {/* Seek bar with bookmark markers */}
          <div className="w-full max-w-md relative">
            <SeekBar currentTime={currentTime} duration={duration} onSeek={seekTo} />
            {/* Bookmark markers on seek bar */}
            {duration > 0 && lessonBookmarks.length > 0 && (
              <div className="absolute top-0 inset-x-0 h-5 pointer-events-auto" style={{ zIndex: 1 }}>
                {lessonBookmarks.map((bm) => {
                  const pct = (bm.position / duration) * 100;
                  const colorClass = tagColorMap[bm.tag] || 'bg-primary';
                  return (
                    <button
                      key={bm.id}
                      onClick={() => seekTo(bm.position)}
                      className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${colorClass} border border-black/30 shadow-sm hover:scale-150 transition-transform cursor-pointer`}
                      style={{
                        [document.documentElement?.dir === 'rtl' ? 'right' : 'left']: `calc(${pct}% - 5px)`,
                      }}
                      title={bm.note || getTagInfo(bm.tag)?.label || ''}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Main controls -- dir="ltr" keeps layout predictable; we swap icons+functions for RTL */}
          <div dir="ltr" className="flex items-center justify-center gap-6 w-full max-w-md">
            <SpeedControl speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />

            {/* Skip backward (always left of play -- dir="ltr" keeps standard media layout) */}
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
                <Play className="h-8 w-8 fill-current ml-1" />
              )}
            </button>

            {/* Skip forward (always right of play -- dir="ltr" keeps standard media layout) */}
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
          <div className="flex items-center justify-center gap-6 pt-2 flex-wrap">
            <button
              onClick={() => setShowBookmarkDialog(true)}
              className={`flex flex-col items-center gap-1.5 transition-colors ${
                bookmarkCount > 0
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="relative">
                <Bookmark className={`h-5 w-5 ${bookmarkCount > 0 ? 'fill-current' : ''}`} />
                {bookmarkCount > 0 && (
                  <span className="absolute -top-1.5 -end-2 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {bookmarkCount}
                  </span>
                )}
              </div>
              <span className="text-[10px]">{t('bookmark')}</span>
            </button>
            <button
              onClick={() => setShowShareClipDialog(true)}
              className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Scissors className="h-5 w-5" />
              <span className="text-[10px]">שתף קטע</span>
            </button>
            <button
              onClick={() => router.push(`/${locale}/driving`)}
              className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Car className="h-5 w-5" />
              <span className="text-[10px]">מצב נהיגה</span>
            </button>
            <button className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Download className="h-5 w-5" />
              <span className="text-[10px]">{t('download')}</span>
            </button>
            <button
              onClick={() => void handleCastClick()}
              className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cast"
            >
              <Cast className="h-5 w-5" />
              <span className="text-[10px]">{t('cast') || 'שדר'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bookmark dialog */}
      <BookmarkDialog
        isOpen={showBookmarkDialog}
        onClose={() => setShowBookmarkDialog(false)}
        lessonId={currentTrack.id}
        position={currentTime}
      />

      {/* Share clip dialog */}
      <ShareClipDialog
        isOpen={showShareClipDialog}
        onClose={() => setShowShareClipDialog(false)}
        lessonId={currentTrack.id}
        currentTime={currentTime}
        duration={duration}
        lessonTitle={currentTrack.hebrewTitle || currentTrack.title}
      />
    </>
  );
}
