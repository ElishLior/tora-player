'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Trash2, HardDrive, Wifi, WifiOff } from 'lucide-react';
import { getDownloadedLessons, deleteDownloadedLesson, getStorageUsage } from '@/lib/offline-storage';
import { formatFileSize } from '@/lib/audio-utils';
import { formatDuration } from '@/lib/utils';
import { EmptyState } from '@/components/shared/empty-state';

interface OfflineLesson {
  lessonId: string;
  title: string;
  hebrewTitle: string;
  audioUrl: string;
  duration: number;
  fileSize: number;
  downloadedAt: string;
  seriesName?: string;
  date: string;
}

export default function OfflinePage() {
  const t = useTranslations('offline');
  const [lessons, setLessons] = useState<OfflineLesson[]>([]);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [isOnline, setIsOnline] = useState(true);

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
              className="flex items-center gap-3 rounded-xl border bg-card p-4"
            >
              <Download className="h-5 w-5 text-green-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" dir="rtl">
                  {lesson.hebrewTitle || lesson.title}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDuration(lesson.duration)}</span>
                  <span>·</span>
                  <span>{formatFileSize(lesson.fileSize)}</span>
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
