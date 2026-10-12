'use client';

import { useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useModalDialog } from '@/hooks/use-modal-dialog';
import { UpNextList } from './up-next-list';

interface UpNextSheetProps {
  onClose: () => void;
}

/** The queue after the current track, as a modal sheet. The rows are `UpNextList`. */
export function UpNextSheet({ onClose }: UpNextSheetProps) {
  const t = useTranslations('player');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, onClose);

  return (
    <div className="fixed inset-0 z-[105] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="up-next-title"
        tabIndex={-1}
        className="animate-slide-up relative flex max-h-[75vh] flex-col rounded-t-2xl border-t border-[hsl(0,0%,20%)] bg-[hsl(var(--surface-elevated))] pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 id="up-next-title" className="text-base font-bold">
            {t('upNext')}
          </h2>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t('dismiss')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <UpNextList className="overflow-y-auto" onJump={onClose} focusFallback={dialogRef} />
      </div>
    </div>
  );
}
