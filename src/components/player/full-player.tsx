'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  Bookmark,
  FileDown,
  Cast,
  Car,
  Scissors,
  Download,
  CheckCircle,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from './seek-bar';
import { SpeedControl } from './speed-control';
import { PlayPauseIcon, SkipButton } from './player-controls';
import { handleCastClick } from '@/lib/cast-utils';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { BookmarkChips, BookmarkMarkers } from '@/components/bookmarks/lesson-bookmarks';
import { ShareClipDialog } from '@/components/player/share-clip-dialog';
import { downloadLessonAudioFiles, getDownloadedLesson } from '@/lib/offline-storage';
import {
  getTrackDownloadFilename,
  getTrackDownloadUrl,
  getTrackLessonId,
  getTrackOfflineDownloadInput,
  getTrackOfflineLessonInput,
  isTrackDownloadedInLesson,
} from '@/lib/player-track-actions';
import { notifyOfflineDownloadsChanged } from '@/lib/offline-events';

interface FullPlayerProps {
  onClose: () => void;
}

export function FullPlayer({ onClose }: FullPlayerProps) {
  const t = useTranslations('player');
  const {
    currentTrack,
    currentTime,
    duration,
    playbackSpeed,
    playbackIssue,
    transport,
    togglePlay,
    skipForward,
    skipBackward,
    seekTo,
    setPlaybackSpeed,
  } = useAudioPlayer();

  const locale = useLocale();
  const router = useRouter();
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);
  const [showShareClipDialog, setShowShareClipDialog] = useState(false);
  const [offlineSaveState, setOfflineSaveState] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [offlineSaveProgress, setOfflineSaveProgress] = useState(0);

  const lessonId = currentTrack ? getTrackLessonId(currentTrack) : '';

  useEffect(() => {
    if (!currentTrack) {
      setOfflineSaveState('idle');
      setOfflineSaveProgress(0);
      return;
    }

    let cancelled = false;

    setOfflineSaveState('idle');
    setOfflineSaveProgress(0);

    getDownloadedLesson(lessonId).then((downloadedLesson) => {
      if (!cancelled && isTrackDownloadedInLesson(currentTrack, downloadedLesson)) {
        setOfflineSaveState('downloaded');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentTrack, lessonId]);

  const handleSaveOffline = useCallback(async () => {
    if (!currentTrack) return;
    if (offlineSaveState === 'downloaded' || offlineSaveState === 'downloading') return;

    setOfflineSaveState('downloading');
    setOfflineSaveProgress(0);

    const success = await downloadLessonAudioFiles(
      lessonId,
      [getTrackOfflineDownloadInput(currentTrack)],
      getTrackOfflineLessonInput(currentTrack),
      (pct) => setOfflineSaveProgress(pct),
    );

    if (success) {
      setOfflineSaveProgress(100);
      setOfflineSaveState('downloaded');
      notifyOfflineDownloadsChanged(lessonId);
      return;
    }

    setOfflineSaveState('error');
    setTimeout(() => {
      setOfflineSaveState('idle');
      setOfflineSaveProgress(0);
    }, 3000);
  }, [currentTrack, lessonId, offlineSaveState]);

  if (!currentTrack) return null;

  const lessonBookmarks = bookmarks.filter((b) => b.lessonId === lessonId);
  const bookmarkCount = lessonBookmarks.length;
  const downloadFilename = getTrackDownloadFilename(currentTrack);
  const downloadUrl = getTrackDownloadUrl(currentTrack);

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex flex-col safe-area-inset animate-slide-up"
        style={{
          background: 'linear-gradient(180deg, hsl(141 30% 12%) 0%, hsl(0 0% 7%) 40%)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('closePlayer')}
          >
            <ChevronDown className="h-6 w-6" />
          </button>
          <div className="text-center">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{t('nowPlaying')}</p>
            {currentTrack.seriesName && (
              <p className="text-xs font-bold text-foreground" dir="auto">
                {currentTrack.seriesName}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              onClose();
              router.push(`/${locale}/lessons/${lessonId}`);
            }}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('openLesson')}
          >
            <BookOpen className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center px-8 gap-5 overflow-y-auto pt-4 pb-6">
          {/* Large artwork */}
          <div
            className="w-64 h-64 sm:w-72 sm:h-72 rounded-xl shadow-2xl flex-shrink-0 flex items-center justify-center overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, hsl(141 30% 18%) 0%, hsl(141 20% 8%) 100%)',
            }}
          >
            <div className="text-center space-y-3">
              <div className="text-7xl">📖</div>
              <p className="text-sm text-muted-foreground font-medium" dir="auto">
                {currentTrack.seriesName || t('lessonFallback')}
              </p>
            </div>
          </div>

          {/* Track info */}
          <div className="w-full max-w-md space-y-1 flex-shrink-0">
            <h2 className="text-xl font-bold text-foreground truncate" dir="auto">
              {currentTrack.hebrewTitle || currentTrack.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {currentTrack.seriesName && (
                <span className="text-primary" dir="auto">
                  {currentTrack.seriesName}
                </span>
              )}
              {currentTrack.date && currentTrack.seriesName && ' · '}
              {currentTrack.date && <bdi>{currentTrack.date}</bdi>}
            </p>
            {currentTrack.description && (
              <p className="text-xs text-muted-foreground/80 leading-relaxed pt-1 line-clamp-2" dir="auto">
                {currentTrack.description}
              </p>
            )}
          </div>

          {/* Seek bar with bookmark markers */}
          <div className="w-full max-w-md relative flex-shrink-0">
            <SeekBar currentTime={currentTime} duration={duration} onSeek={seekTo} />
            <BookmarkMarkers bookmarks={lessonBookmarks} duration={duration} onSeek={seekTo} />
          </div>

          {playbackIssue && (
            <p role="status" className="w-full max-w-md text-center text-xs text-amber-300 flex-shrink-0">
              {t(`issue.${playbackIssue}`)}
            </p>
          )}

          {/* Main controls: back → play → forward in DOM order; RTL puts "back" on the right. */}
          <div className="flex items-center justify-center gap-6 w-full max-w-md flex-shrink-0">
            <SpeedControl speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />

            <SkipButton
              direction="back"
              onClick={skipBackward}
              className="p-2 text-muted-foreground hover:text-foreground"
              iconClassName="h-8 w-8"
            />

            <button
              type="button"
              onClick={togglePlay}
              className="rounded-full p-4 bg-foreground text-background hover:scale-105 transition-transform shadow-xl"
              aria-label={transport === 'paused' ? t('play') : t('pause')}
            >
              <PlayPauseIcon transport={transport} className="h-8 w-8" />
            </button>

            <SkipButton
              direction="forward"
              onClick={skipForward}
              className="p-2 text-muted-foreground hover:text-foreground"
              iconClassName="h-8 w-8"
            />

            {/* Balances the speed control on the other side */}
            <div className="w-12" aria-hidden />
          </div>

          <div className="w-full max-w-md flex-shrink-0">
            <BookmarkChips bookmarks={lessonBookmarks} onSeek={seekTo} />
          </div>

          {/* Secondary actions */}
          <div className="flex items-center justify-center gap-6 pt-2 flex-wrap flex-shrink-0">
            <button
              onClick={() => setBookmarkPosition(currentTime)}
              className={`flex flex-col items-center gap-1.5 transition-colors ${bookmarkCount > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
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
              <span className="text-[10px]">{t('markSnippet')}</span>
            </button>
            <button
              onClick={() => router.push(`/${locale}/driving`)}
              className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Car className="h-5 w-5" />
              <span className="text-[10px]">{t('drivingMode')}</span>
            </button>
            <button
              onClick={handleSaveOffline}
              disabled={offlineSaveState === 'downloaded' || offlineSaveState === 'downloading'}
              className={`flex flex-col items-center gap-1.5 transition-colors disabled:cursor-not-allowed ${offlineSaveState === 'downloaded' ? 'text-green-400' : offlineSaveState === 'downloading' ? 'text-primary' : offlineSaveState === 'error' ? 'text-red-400' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label={t('saveOffline')}
            >
              {offlineSaveState === 'downloading' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : offlineSaveState === 'downloaded' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <Download className="h-5 w-5" />
              )}
              <span className="text-[10px] whitespace-nowrap">
                {offlineSaveState === 'downloading'
                  ? `${offlineSaveProgress}%`
                  : offlineSaveState === 'downloaded'
                    ? t('savedOffline')
                    : t('saveOffline')}
              </span>
            </button>
            <a
              href={downloadUrl}
              download={downloadFilename}
              className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={locale === 'he' ? 'הורדת קובץ למכשיר' : 'Download file to device'}
            >
              <FileDown className="h-5 w-5" />
              <span className="text-[10px] whitespace-nowrap">{t('downloadFile')}</span>
            </a>
            <button
              onClick={() => void handleCastClick()}
              className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('cast')}
            >
              <Cast className="h-5 w-5" />
              <span className="text-[10px]">{t('cast')}</span>
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

      {/* Share clip dialog */}
      <ShareClipDialog
        isOpen={showShareClipDialog}
        onClose={() => setShowShareClipDialog(false)}
        lessonId={lessonId}
        currentTime={currentTime}
        duration={duration}
        lessonTitle={currentTrack.hebrewTitle || currentTrack.title}
      />
    </>
  );
}
