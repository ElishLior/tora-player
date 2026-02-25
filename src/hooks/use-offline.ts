'use client';

import { useState, useEffect } from 'react';
import { isLessonDownloaded } from '@/lib/offline-storage';

/**
 * Hook to check if a lesson is downloaded for offline playback.
 * Returns false during SSR and initial render to avoid hydration mismatch.
 */
export function useIsDownloaded(lessonId: string): boolean {
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    isLessonDownloaded(lessonId).then((result) => {
      if (!cancelled) {
        setDownloaded(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  return downloaded;
}
