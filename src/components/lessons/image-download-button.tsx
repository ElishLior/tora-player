'use client';

import { useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2 } from 'lucide-react';
import { downloadLessonImage } from '@/lib/image-download-client';
import { imageDownloadPath } from '@/lib/image-download';

type Phase = 'idle' | 'preparing' | 'started' | 'opened' | 'error';

interface ImageDownloadButtonProps {
  imageId: string;
  /** The lightbox number (1-based), named in the accessible label. */
  number: number;
}

/**
 * Downloads one lesson image at full size. Lives inside the lightbox, which
 * closes on a backdrop click, so the click never bubbles out. The status line
 * says "download started" (the browser cannot confirm a save) and an error
 * leaves the page, and playback, where they are.
 */
export function ImageDownloadButton({ imageId, number }: ImageDownloadButtonProps) {
  const t = useTranslations('imageDownload');
  const [phase, setPhase] = useState<Phase>('idle');

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (phase === 'preparing') return;

    setPhase('preparing');
    const homeScreenApp = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    downloadLessonImage(imageDownloadPath(imageId), { homeScreenApp })
      .then((result) => setPhase(result))
      .catch(() => setPhase('error'));
  };

  const busy = phase === 'preparing';
  const message =
    phase === 'preparing'
      ? t('preparing')
      : phase === 'started'
        ? t('started')
        : phase === 'opened'
          ? t('iosHint')
          : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        aria-label={t('ariaLabel', { number })}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60 motion-reduce:transition-none"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{t('label')}</span>
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-white/80" dir="auto">
        {message}
      </p>
      {phase === 'error' && (
        <p role="alert" className="text-center text-sm font-medium text-red-300">
          {t('error')}
        </p>
      )}
    </div>
  );
}
