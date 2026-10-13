'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, HardDrive, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { getDownloadedLessons, getStorageUsage, type OfflineLessonMeta } from '@/lib/offline-storage';
import { OFFLINE_DOWNLOADS_CHANGED_EVENT } from '@/lib/offline-events';
import { formatFileSize } from '@/lib/audio-utils';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { CardGrid } from '@/components/shared/card-grid';
import { SavedLessonRow } from '@/components/offline/saved-lesson-row';

/**
 * Offline library. The service worker precaches this page and its chunks, and
 * serves it for any navigation made without a network, so everything here
 * comes from IndexedDB and plays from blob URLs.
 */
export default function OfflinePage() {
  const t = useTranslations('offline');
  const tDesign = useTranslations('pagesDesign');
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

  const totalDownloaded = lessons?.reduce((acc, lesson) => acc + lesson.fileSize, 0) ?? 0;
  const usedPercent = storage.quota > 0 ? Math.min((storage.used / storage.quota) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {/* Status and storage: one band (a row from sm, stacked on phones). Local data only. */}
      <section className="flex flex-col gap-4 rounded-2xl bg-[hsl(var(--surface-elevated))] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-2 text-sm" role="status">
          {isOnline ? (
            <>
              <Wifi aria-hidden="true" className="h-4 w-4 text-green-500" />
              <span className="font-medium text-green-500">{t('online')}</span>
            </>
          ) : (
            <>
              <WifiOff aria-hidden="true" className="h-4 w-4 text-orange-500" />
              <span className="font-medium text-orange-500">{t('offlineStatus')}</span>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-2 sm:w-80">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <HardDrive aria-hidden="true" className="h-4 w-4" />
            <span className="font-medium">{t('storageUsed')}</span>
          </div>
          <p className="text-2xl font-bold">
            <bdi dir="ltr">{formatFileSize(totalDownloaded)}</bdi>
          </p>
          {storage.quota > 0 && (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--surface-highlight))]">
                <div className="h-full rounded-full bg-primary" style={{ width: `${usedPercent}%` }} />
              </div>
              <p className="text-[13px] text-muted-foreground">
                <bdi dir="ltr">
                  {formatFileSize(storage.used)} / {formatFileSize(storage.quota)}
                </bdi>
              </p>
            </>
          )}
        </div>
      </section>

      {lessons === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : lessons.length > 0 ? (
        <section aria-labelledby="saved-lessons-title" className="space-y-3">
          <h2 id="saved-lessons-title" className="text-lg font-bold">
            {tDesign('offline.savedLessons')}
          </h2>
          <CardGrid variant="rows">
            {lessons.map((lesson) => (
              <SavedLessonRow key={lesson.lessonId} lesson={lesson} />
            ))}
          </CardGrid>
        </section>
      ) : (
        <EmptyState icon={Download} title={t('noDownloads')} description={t('noDownloadsHint')} />
      )}
    </div>
  );
}
