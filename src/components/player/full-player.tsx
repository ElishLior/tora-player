'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  ListMusic,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from './seek-bar';
import { SpeedControl } from './speed-control';
import { PlayPauseIcon, SkipButton } from './player-controls';
import { SleepTimerControl } from './sleep-timer';
import { UpNextSheet } from './up-next';
import { CastStatusMessage } from './cast-status';
import { audioEngine } from '@/lib/audio-engine';
import { handleCastClick, isCastableSource } from '@/lib/cast-utils';
import { useModalDialog } from '@/hooks/use-modal-dialog';
import { useAudioStore } from '@/stores/audio-store';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { isMomentInPart } from '@/lib/lesson-tracks';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { BookmarkChips, BookmarkMarkers } from '@/components/bookmarks/lesson-bookmarks';
import { ShareClipDialog } from '@/components/player/share-clip-dialog';
import { saveAudioFilesOffline, getDownloadedLesson } from '@/lib/offline-storage';
import { handleDeviceDownloadClick } from '@/lib/device-download';
import {
  getTrackDownloadFilename,
  getTrackDownloadUrl,
  getTrackLessonId,
  getTrackOfflineDownloadInput,
  getTrackOfflineLessonInput,
  isTrackDownloadedInLesson,
} from '@/lib/player-track-actions';

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
    hasNextTrack,
    hasPreviousTrack,
    nextTrack,
    previousTrack,
  } = useAudioPlayer();

  const locale = useLocale();
  const router = useRouter();
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);
  const [showShareClipDialog, setShowShareClipDialog] = useState(false);
  const [offlineSaveState, setOfflineSaveState] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [offlineSaveProgress, setOfflineSaveProgress] = useState(0);
  const [showUpNext, setShowUpNext] = useState(false);
  const upNextCount = useAudioStore((s) => Math.max(0, s.queue.length - s.queueIndex - 1));
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus returns to the mini player's expand button, which replaces this player.
  useModalDialog(dialogRef, onClose, '[data-player-expand]');

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

  const [offlineSaveError, setOfflineSaveError] = useState<'quota' | 'failed' | null>(null);
  const tOffline = useTranslations('offline');

  const handleSaveOffline = useCallback(async () => {
    if (!currentTrack) return;
    if (offlineSaveState === 'downloaded' || offlineSaveState === 'downloading') return;

    setOfflineSaveState('downloading');
    setOfflineSaveProgress(0);

    const result = await saveAudioFilesOffline(
      lessonId,
      [getTrackOfflineDownloadInput(currentTrack)],
      getTrackOfflineLessonInput(currentTrack),
      (pct) => setOfflineSaveProgress(pct),
    );

    if (result.ok) {
      setOfflineSaveProgress(100);
      setOfflineSaveState('downloaded');
      return;
    }

    setOfflineSaveState('error');
    setOfflineSaveError(result.reason);
    setTimeout(() => {
      setOfflineSaveState('idle');
      setOfflineSaveProgress(0);
      setOfflineSaveError(null);
    }, 5000);
  }, [currentTrack, lessonId, offlineSaveState]);

  if (!currentTrack) return null;

  const lessonBookmarks = bookmarks.filter((b) => b.lessonId === lessonId);
  // This player seeks within the loaded file, so it lists only that part's bookmarks.
  const partBookmarks = lessonBookmarks.filter((b) => isMomentInPart(b.audioFileId, currentTrack));
  const bookmarkCount = lessonBookmarks.length;
  const downloadFilename = getTrackDownloadFilename(currentTrack);
  const downloadUrl = getTrackDownloadUrl(currentTrack);

  return (
    <>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="full-player-title"
        tabIndex={-1}
        className="fixed inset-0 z-[100] flex flex-col safe-area-inset animate-slide-up outline-none"
        style={{
          background: 'linear-gradient(180deg, hsl(141 30% 12%) 0%, hsl(0 0% 7%) 40%)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            data-autofocus
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
            <h2 id="full-player-title" className="text-xl font-bold text-foreground truncate" dir="auto">
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
            <BookmarkMarkers bookmarks={partBookmarks} duration={duration} onSeek={(bookmark) => seekTo(bookmark.position)} />
          </div>

          {playbackIssue && (
            <p role="status" className="w-full max-w-md text-center text-xs text-amber-300 flex-shrink-0">
              {t(`issue.${playbackIssue}`)}
            </p>
          )}

          {/*
            Transport in DOM order: previous → back → play → forward → next;
            dir="rtl" mirrors the row. Lesson arrows appear only with queue neighbours.
          */}
          <div className="flex items-center justify-center gap-4 w-full max-w-md flex-shrink-0">
            <div className="w-10">
              {hasPreviousTrack && (
                <button
                  type="button"
                  onClick={previousTrack}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('previousTrack')}
                >
                  <SkipBack className="h-6 w-6 rtl:-scale-x-100" />
                </button>
              )}
            </div>

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

            <div className="w-10">
              {hasNextTrack && (
                <button
                  type="button"
                  onClick={nextTrack}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('nextTrack')}
                >
                  <SkipForward className="h-6 w-6 rtl:-scale-x-100" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between w-full max-w-md flex-shrink-0">
            <SpeedControl speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />
            {upNextCount > 0 && (
              <button
                type="button"
                onClick={() => setShowUpNext(true)}
                aria-haspopup="dialog"
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                <ListMusic className="h-4 w-4" />
                {t('upNext')}
                <span className="tabular-nums">({upNextCount})</span>
              </button>
            )}
          </div>

          <div className="w-full max-w-md flex-shrink-0">
            <BookmarkChips bookmarks={partBookmarks} onSeek={(bookmark) => seekTo(bookmark.position)} />
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
            <SleepTimerControl className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors" />
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
            {offlineSaveError && (
              <p
                role="alert"
                className="fixed inset-x-4 bottom-8 z-[60] mx-auto max-w-md rounded-lg bg-destructive px-4 py-3 text-center text-sm text-destructive-foreground shadow-lg"
              >
                {tOffline(offlineSaveError === 'quota' ? 'storageFull' : 'saveFailed')}
              </p>
            )}
            <a
              href={downloadUrl}
              download={downloadFilename}
              onClick={(e) =>
                handleDeviceDownloadClick(e, {
                  lessonId,
                  offlineKey: currentTrack.offlineKey,
                  audioUrl: currentTrack.audioUrl,
                  filename: downloadFilename,
                  savedOffline: offlineSaveState === 'downloaded',
                })
              }
              className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('downloadToDevice')}
            >
              <FileDown className="h-5 w-5" />
              <span className="text-[10px] whitespace-nowrap">{t('downloadFile')}</span>
            </a>
            {isCastableSource(audioEngine.getCurrentUrl()) && (
              <button
                type="button"
                onClick={() => void handleCastClick()}
                className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Cast className="h-5 w-5" />
                <span className="text-[10px]">{t('cast')}</span>
              </button>
            )}
          </div>
        </div>

        {showUpNext && <UpNextSheet onClose={() => setShowUpNext(false)} />}
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
