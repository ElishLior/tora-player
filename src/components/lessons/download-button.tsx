'use client';

import { useState, useCallback } from 'react';
import { CloudDownload, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { downloadLesson } from '@/lib/offline-storage';
import { useIsDownloaded } from '@/hooks/use-offline';

interface DownloadButtonProps {
  lessonId: string;
  audioUrl: string;
  title?: string;
  hebrewTitle?: string;
  duration?: number;
  seriesName?: string;
  date?: string;
}

type DownloadState = 'idle' | 'downloading' | 'downloaded' | 'error';

export function DownloadButton({
  lessonId,
  audioUrl,
  title = '',
  hebrewTitle = '',
  duration = 0,
  seriesName,
  date = '',
}: DownloadButtonProps) {
  const isAlreadyDownloaded = useIsDownloaded(lessonId);
  const [state, setState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);

  const effectiveState = isAlreadyDownloaded && state === 'idle' ? 'downloaded' : state;

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (effectiveState === 'downloaded' || effectiveState === 'downloading') return;

      setState('downloading');
      setProgress(0);

      const success = await downloadLesson(
        lessonId,
        audioUrl,
        {
          lessonId,
          title,
          hebrewTitle,
          audioUrl,
          duration,
          fileSize: 0,
          seriesName,
          date,
        },
        (percent) => setProgress(percent)
      );

      if (success) {
        setState('downloaded');
      } else {
        setState('error');
        // Reset to idle after 3 seconds on error
        setTimeout(() => setState('idle'), 3000);
      }
    },
    [effectiveState, lessonId, audioUrl, title, hebrewTitle, duration, seriesName, date]
  );

  return (
    <button
      onClick={handleDownload}
      disabled={effectiveState === 'downloaded' || effectiveState === 'downloading'}
      className="relative flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-all hover:bg-[hsl(var(--surface-highlight))] disabled:opacity-70"
      aria-label={
        effectiveState === 'downloaded'
          ? 'Downloaded'
          : effectiveState === 'downloading'
          ? `Downloading ${progress}%`
          : effectiveState === 'error'
          ? 'Download failed'
          : 'Download for offline'
      }
    >
      {effectiveState === 'idle' && (
        <CloudDownload className="h-4 w-4 text-muted-foreground" />
      )}

      {effectiveState === 'downloading' && (
        <>
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          {progress > 0 && (
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 32 32">
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-primary/20"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${(progress / 100) * 88} 88`}
                className="text-primary transition-all duration-300"
              />
            </svg>
          )}
        </>
      )}

      {effectiveState === 'downloaded' && (
        <CheckCircle className="h-4 w-4 text-green-500" />
      )}

      {effectiveState === 'error' && (
        <AlertCircle className="h-4 w-4 text-red-400" />
      )}
    </button>
  );
}
