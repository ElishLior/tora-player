'use client';

import { useRef } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { playTrack } from '@/lib/audio-controller';
import { getResumePoint } from '@/lib/lesson-progress';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { formatDuration } from '@/lib/utils';
import { useModalDialog } from '@/hooks/use-modal-dialog';
import { getTrackKey, useAudioStore } from '@/stores/audio-store';
import { useProgressStore } from '@/stores/progress-store';

interface UpNextSheetProps {
  onClose: () => void;
}

/**
 * Starts a queue item. A lesson left in the middle of this very part
 * continues where it stopped; anything else starts at the beginning.
 */
function jumpToQueueItem(index: number) {
  const { queue } = useAudioStore.getState();
  const track = queue[index];
  if (!track) return;
  const progress = useProgressStore.getState().progressMap[getTrackLessonId(track)];
  const samePart =
    progress && (progress.audioFileId ? progress.audioFileId === track.audioFileId : (track.partIndex ?? 0) === 0);
  const { position } = getResumePoint([track], samePart ? progress : undefined);
  playTrack(track, { queue, queueIndex: index, startAt: position > 0 ? position : undefined });
}

/** The queue after the current track: jump to an item, reorder it, or drop it. */
export function UpNextSheet({ onClose }: UpNextSheetProps) {
  const t = useTranslations('player');
  const { queue, queueIndex, moveInQueue, removeFromQueue } = useAudioStore(
    useShallow((s) => ({
      queue: s.queue,
      queueIndex: s.queueIndex,
      moveInQueue: s.moveInQueue,
      removeFromQueue: s.removeFromQueue,
    })),
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, onClose);

  // The row moves with its item; keep focus on the pressed arrow while it still works.
  const move = (button: HTMLButtonElement, from: number, to: number) => {
    moveInQueue(from, to);
    requestAnimationFrame(() => (button.isConnected && !button.disabled ? button : dialogRef.current)?.focus());
  };

  const firstUpcoming = queueIndex + 1;
  const upcoming = queue.slice(firstUpcoming);

  return (
    <div className="fixed inset-0 z-[105] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="up-next-title"
        tabIndex={-1}
        className="relative flex max-h-[75vh] flex-col rounded-t-2xl border-t border-[hsl(0,0%,20%)] bg-[hsl(var(--surface-elevated))] pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none animate-slide-up"
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

        {upcoming.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-muted-foreground">{t('upNextEmpty')}</p>
        ) : (
          <ol className="space-y-0.5 overflow-y-auto px-2 pb-4">
            {upcoming.map((track, offset) => {
              const index = firstUpcoming + offset;
              const hasParts = (track.partCount ?? 1) > 1 || (!!track.audioFileId && track.partCount === undefined);
              return (
                <li key={getTrackKey(track) ?? index} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      jumpToQueueItem(index);
                      onClose();
                    }}
                    className="min-w-0 flex-1 rounded-lg px-2 py-2 text-start transition-colors hover:bg-[hsl(var(--surface-highlight))]"
                  >
                    <span className="block truncate text-sm font-semibold text-foreground" dir="auto">
                      {track.hebrewTitle || track.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {track.seriesName && <bdi>{track.seriesName}</bdi>}
                      {track.seriesName && (hasParts || track.duration > 0) && ' · '}
                      {hasParts && (track.partCount
                        ? t('partOf', { number: (track.partIndex ?? 0) + 1, count: track.partCount })
                        : t('partUnknown'))}
                      {hasParts && track.duration > 0 && ' · '}
                      {track.duration > 0 && <bdi>{formatDuration(track.duration)}</bdi>}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => move(e.currentTarget, index, index - 1)}
                    disabled={index === firstUpcoming}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    aria-label={t('moveUp')}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => move(e.currentTarget, index, index + 1)}
                    disabled={index === queue.length - 1}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    aria-label={t('moveDown')}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeFromQueue(index);
                      // The focused row is gone; keep keyboard focus inside the sheet.
                      dialogRef.current?.focus();
                    }}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t('removeFromQueue')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
