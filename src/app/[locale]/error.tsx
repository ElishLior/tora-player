'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { useAudioStore } from '@/stores/audio-store';
import { claimChunkReload, isChunkLoadError } from '@/lib/chunk-error';
import { cn } from '@/lib/utils';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const t = useTranslations('errorPage');
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    console.error('[Error Boundary]', error);
    // A new deploy removed this build's chunks: reload once to pick up the new
    // build, but never cut off a lesson that is playing (the screen below
    // offers the reload instead).
    if (!chunkError || useAudioStore.getState().isPlaying) return;
    let reload = false;
    try {
      reload = claimChunkReload(window.sessionStorage);
    } catch {
      // Storage blocked: no automatic reload, so no loop.
    }
    if (reload) window.location.reload();
  }, [error, chunkError]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <div className="rounded-full bg-destructive/10 p-4 mb-6">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>

      <h2 className="text-2xl font-bold mb-2">{chunkError ? t('updateTitle') : t('title')}</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        {chunkError ? t('updateDescription') : t('description')}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {chunkError && (
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            {t('reload')}
          </button>
        )}
        <button
          onClick={reset}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors',
            chunkError
              ? 'bg-[hsl(var(--surface-highlight))] text-muted-foreground hover:text-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          <RotateCcw className="h-4 w-4" />
          {t('retry')}
        </button>
      </div>
    </div>
  );
}
