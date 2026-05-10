'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Trash2, HardDrive, Wifi, WifiOff, Play } from 'lucide-react';
import { getDownloadedLessons, deleteDownloadedLesson, getStorageUsage, type OfflineLessonMeta, type OfflineAudioFileMeta } from '@/lib/offline-storage';
import { formatFileSize } from '@/lib/audio-utils';
import { formatDuration } from '@/lib/utils';
import { EmptyState } from '@/components/shared/empty-state';
import { useAudioStore } from '@/stores/audio-store';

export default function OfflinePage() {
  const t = useTranslations('offline');
  const locale = useLocale();
  const isRTL = locale === 'he';
  const [lessons, setLessons] = useState<OfflineLessonMeta[]>([]);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [isOnline, setIsOnline] = useState(true);
  const setTrack = useAudioStore((s) => s.setTrack);

  useEffect(() => {
    loadData();
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function loadData() {
    const [downloaded, storageInfo] = await Promise.all([
      getDownloadedLessons(),
      getStorageUsage(),
    ]);
    setLessons(downloaded);
    setStorage(storageInfo);
  }

  async function handleDelete(lessonId: string) {
    await deleteDownloadedLesson(lessonId);
    loadData();
  }

  function handlePlay(lesson: OfflineLessonMeta, file: OfflineAudioFileMeta = lesson.audioFiles[0]) {
    if (!file) return;
    setTrack({
      id: lesson.lessonId,
      lessonId: lesson.lessonId,
      audioFileId: file.audioFileId,
      fileKey: file.fileKey,
      offlineKey: file.offlineKey,
      title: lesson.title,
      hebrewTitle: lesson.hebrewTitle || lesson.title,
      audioUrl: file.audioUrl,
      duration: file.duration || lesson.duration,
      seriesName: lesson.seriesName,
      date: lesson.date,
      originalName: file.originalName || file.title,
    });
  }

  const totalDownloaded = lessons.reduce((acc, l) => acc + l.fileSize, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* Status */}
      <div className="flex items-center gap-2 text-sm">
        {isOnline ? (
          <><Wifi className="h-4 w-4 text-green-500" /> <span className="text-green-600">מחובר</span></>
        ) : (
          <><WifiOff className="h-4 w-4 text-orange-500" /> <span className="text-orange-600">לא מקוון</span></>
        )}
      </div>

      {/* Storage info */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('storageUsed')}</span>
        </div>
        <div className="text-2xl font-bold">{formatFileSize(totalDownloaded)}</div>
        {storage.quota > 0 && (
          <>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min((storage.used / storage.quota) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(storage.used)} / {formatFileSize(storage.quota)}
            </p>
          </>
        )}
      </div>

      {/* Downloaded lessons */}
      {lessons.length > 0 ? (
        <div className="space-y-3">
          {lessons.map((lesson) => (
            <div
              key={lesson.lessonId}
              className="rounded-xl border bg-card p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-green-500 flex-shrink-0" />
                <button
                  onClick={() => handlePlay(lesson)}
                  className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:scale-105 transition-transform"
                  aria-label={isRTL ? 'נגן שיעור שהורד' : 'Play downloaded lesson'}
                >
                  <Play className="h-4 w-4 fill-current ms-0.5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" dir="rtl">
                    {lesson.hebrewTitle || lesson.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDuration(lesson.duration)}</span>
                    <span>·</span>
                    <span>{formatFileSize(lesson.fileSize)}</span>
                    <span>·</span>
                    <span>
                      {lesson.audioFiles.length} {lesson.audioFiles.length === 1 ? 'קובץ' : 'קבצים'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(lesson.lessonId)}
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
                      aria-label={isRTL ? 'נגן קובץ שהורד' : 'Play downloaded file'}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span className="flex-1 truncate text-start" dir="rtl">
                        {file.originalName || file.title || `חלק ${index + 1}`}
                      </span>
                      {file.duration > 0 && (
                        <span className="text-xs tabular-nums">
                          {formatDuration(file.duration)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Download}
          title={t('noDownloads')}
        />
      )}
    </div>
  );
}
