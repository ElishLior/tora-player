'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useModalDialog } from '@/hooks/use-modal-dialog';
import { getPlayingLessonShareData, sharePlayingLesson } from '@/lib/player-share';
import { useAudioStore } from '@/stores/audio-store';

function ManualCopyDialog({
  url,
  onClose,
  fallbackFocus,
}: {
  url: string;
  onClose: () => void;
  fallbackFocus: string;
}) {
  const t = useTranslations('player');
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalDialog(ref, onClose, fallbackFocus);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full min-w-0 max-w-md space-y-3 rounded-xl bg-[hsl(var(--surface-elevated))] p-4 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 id={titleId} className="text-sm font-semibold">
            {t('shareManualCopy')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('shareClose')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <input
          data-autofocus
          readOnly
          value={url}
          aria-label={t('shareLink')}
          dir="ltr"
          onFocus={(event) => event.currentTarget.select()}
          className="w-full min-w-0 rounded-lg border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>
    </div>,
    document.body,
  );
}

/** Read the loaded track on each click; this component never changes playback. */
export function PlayerShareButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('player');
  const shareId = useId();
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleShare = () => {
    if (pending) return;
    const track = useAudioStore.getState().currentTrack;
    if (!track) return;
    const { url } = getPlayingLessonShareData(track);
    // No await before this call: preserve iOS user activation for the share sheet.
    const result = sharePlayingLesson(track);
    setCopied(false);
    setManualUrl(null);
    setPending(true);
    void result.then((outcome) => {
      setPending(false);
      if (outcome === 'copied') setCopied(true);
      if (outcome === 'failed') setManualUrl(url);
    });
  };

  return (
    <div className="shrink-0">
      <button
        type="button"
        data-player-share={shareId}
        onClick={handleShare}
        aria-disabled={pending}
        aria-label={t('shareLesson')}
        className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${compact ? '' : 'flex-col gap-1.5 px-1'}`}
      >
        <Share2 className="h-5 w-5" aria-hidden="true" />
        {!compact && <span className="text-[10px]">{t('shareAction')}</span>}
      </button>
      {copied &&
        createPortal(
          <p
            role="status"
            className="fixed inset-x-4 bottom-36 z-[110] mx-auto max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-4 py-3 text-center text-sm text-foreground shadow-2xl"
          >
            {t('shareCopied')}
          </p>,
          document.body,
        )}
      {manualUrl && (
        <ManualCopyDialog
          url={manualUrl}
          onClose={() => setManualUrl(null)}
          fallbackFocus={`[data-player-share="${shareId}"]`}
        />
      )}
    </div>
  );
}
