'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Trash2, HardDrive, Wifi, WifiOff, Play, Loader2 } from 'lucide-react';
import {
  getDownloadedLessons,
  deleteDownloadedLesson,
  getStorageUsage,
  type OfflineLessonMeta,
  type OfflineAudioFileMeta,
} from '@/lib/offline-storage';
import { OFFLINE_DOWNLOADS_CHANGED_EVENT } from '@/lib/offline-events';
import { formatFileSize } from '@/lib/audio-utils';
import { formatDuration } from '@/lib/utils';
import { EmptyState } from '@/components/shared/empty-state';
import { playTrack } from '@/lib/audio-controller';
import { getOfflineLessonTracks } from '@/lib/lesson-tracks';
import { playLesson } from '@/lib/play-lesson';

/**
 * Offline library. The service worker precaches this page and its chunks, and
 * serves it for any navigation made without a network, so everything here
 * comes from IndexedDB and plays from blob URLs.
 */
export default function OfflinePage() {
  const t = useTranslations('offline');
  // null until IndexedDB has been read: the server-rendered HTML must not
  // claim "no downloads" before the client knows.
  const [lessons, setLessons] = useState<OfflineLessonMeta[] | null>(null);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [isOnline, setIsOnline] = useState(true);

  const loadData = useCallback(async () => {
    const [downloaded, storageInfo] = await Promise.all([getDownloadedLessons(), getStorageUsage()]);
    setLessons(downloaded);
    setStorage(storageInfo);
  }, []);

  useEffect(() => {
    void loadData();
    setIsOnline(navigator.onLine);

    const handleChange = () => void loadData();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener(OFFLINE_DOWNLOADS_CHANGED_EVENT, handleChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener(OFFLINE_DOWNLOADS_CHANGED_EVENT, handleChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadData]);

  /** The lesson continues where it was left; a tapped file plays from its start. Either way all saved parts queue up. */
  function handlePlay(lesson: OfflineLessonMeta, file?: OfflineAudioFileMeta) {
    const tracks = getOfflineLessonTracks(lesson);
    if (!file) {
      playLesson(tracks);
      return;
    }
    const index = tracks.findIndex((track) => track.offlineKey === file.offlineKey);
    if (index >= 0) playTrack(tracks[index], { queue: tracks, queueIndex: index });
  }

  const totalDownloaded = lessons?.reduce((acc, lesson) => acc + lesson.fileSize, 0) ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <div className="flex items-center gap-2 text-sm" role="status">
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4 text-green-500" />
            <span className="text-green-600">{t('online')}</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4 text-orange-500" />
            <span className="text-orange-600">{t('offlineStatus')}</span>
          </>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('storageUsed')}</span>
        </div>
        <div className="text-2xl font-bold">
          <bdi dir="ltr">{formatFileSize(totalDownloaded)}</bdi>
        </div>
        {storage.quota > 0 && (
          <>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min((storage.used / storage.quota) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              <bdi dir="ltr">
                {formatFileSize(storage.used)} / {formatFileSize(storage.quota)}
              </bdi>
            </p>
          </>
        )}
      </div>

      {lessons === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : lessons.length > 0 ? (
        <div className="space-y-3">
          {lessons.map((lesson) => (
            <div key={lesson.lessonId} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePlay(lesson)}
                  className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:scale-105 transition-transform"
                  aria-label={t('play')}
                >
                  <Play className="h-4 w-4 fill-current ms-0.5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    <bdi>{lesson.hebrewTitle || lesson.title}</bdi>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span dir="ltr">{formatDuration(lesson.duration)}</span>
                    <span>·</span>
                    <span dir="ltr">{formatFileSize(lesson.fileSize)}</span>
                    <span>·</span>
                    <span>{t('filesCount', { count: lesson.audioFiles.length })}</span>
                  </div>
                </div>
                <button
                  onClick={() => void deleteDownloadedLesson(lesson.lessonId)}
                  className="rounded-full p-2 hover:bg-destructive/10 text-destructive transition-colors"
                  aria-label={t('remove')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {lesson.audioFiles.length > 1 && (
                <div className="space-y-1 border-t border-border/50 pt-2">
                  {lesson.audioFiles.map((file, index) => (
                    <button
                      key={file.offlineKey}
                      onClick={() => handlePlay(lesson, file)}
                      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
                      aria-label={t('playFile')}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span className="flex-1 truncate text-start">
                        <bdi>{file.originalName || file.title || t('part', { number: index + 1 })}</bdi>
                      </span>
                      {file.duration > 0 && (
                        <span className="text-xs tabular-nums" dir="ltr">{formatDuration(file.duration)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Download} title={t('noDownloads')} description={t('noDownloadsHint')} />
      )}
    </div>
  );
}
