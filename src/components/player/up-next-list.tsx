'use client';

import type { RefObject } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useShallow } from 'zustand/react/shallow';
import { playTrack } from '@/lib/audio-controller';
import { getResumePoint } from '@/lib/lesson-progress';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { cn, formatDuration } from '@/lib/utils';
import { getTrackKey, useAudioStore } from '@/stores/audio-store';
import { useProgressStore } from '@/stores/progress-store';

/**
 * Starts a queue item. A lesson left in the middle of this very part
 * continues where it stopped; anything else starts at the beginning.
 */
export function jumpToQueueItem(index: number) {
  const { queue } = useAudioStore.getState();
  const track = queue[index];
  if (!track) return;
  const progress = useProgressStore.getState().progressMap[getTrackLessonId(track)];
  const samePart =
    progress && (progress.audioFileId ? progress.audioFileId === track.audioFileId : (track.partIndex ?? 0) === 0);
  const { position } = getResumePoint([track], samePart ? progress : undefined);
  playTrack(track, { queue, queueIndex: index, startAt: position > 0 ? position : undefined });
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

interface UpNextListProps {
  /** Show only the first N upcoming items. The Up next sheet shows them all. */
  limit?: number;
  /** Called after a row starts playing (the sheet closes itself). */
  onJump?: () => void;
  /** Focused when the focused row control is removed or sits at an edge. */
  focusFallback?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * The queue after the current track: jump to an item, reorder it, or drop it.
 * Shared by the Up next sheet and the desktop now-playing panel. Edits go only
 * through the store (`moveInQueue`, `removeFromQueue`) and playback only through
 * `playTrack`.
 */
export function UpNextList({ limit, onJump, focusFallback, className }: UpNextListProps) {
  const t = useTranslations('player');
  const { queue, queueIndex, moveInQueue, removeFromQueue } = useAudioStore(
    useShallow((s) => ({
      queue: s.queue,
      queueIndex: s.queueIndex,
      moveInQueue: s.moveInQueue,
      removeFromQueue: s.removeFromQueue,
    })),
  );

  // The row moves with its item; keep focus on the pressed arrow while it still works.
  const move = (button: HTMLButtonElement, from: number, to: number) => {
    moveInQueue(from, to);
    requestAnimationFrame(() => (button.isConnected && !button.disabled ? button : focusFallback?.current)?.focus());
  };

  const firstUpcoming = queueIndex + 1;
  const upcoming = queue.slice(firstUpcoming);
  if (upcoming.length === 0) {
    return <p className="px-4 pb-6 text-sm text-muted-foreground">{t('upNextEmpty')}</p>;
  }
  const visible = limit === undefined ? upcoming : upcoming.slice(0, limit);

  return (
    <ol className={cn('space-y-0.5 px-2 pb-4', className)}>
      {visible.map((track, offset) => {
        // Indices are always positions in the full queue, even when the list is cut short.
        const index = firstUpcoming + offset;
        const hasParts = (track.partCount ?? 1) > 1 || (!!track.audioFileId && track.partCount === undefined);
        return (
          <li key={getTrackKey(track) ?? index} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                jumpToQueueItem(index);
                onJump?.();
              }}
              className={cn(
                'min-w-0 flex-1 rounded-lg px-2 py-2 text-start transition-colors hover:bg-[hsl(var(--surface-highlight))]',
                focusRing,
              )}
            >
              <span className="block truncate text-sm font-semibold text-foreground" dir="auto">
                {track.hebrewTitle || track.title}
              </span>
              <span className="block truncate text-[13px] text-muted-foreground">
                {track.seriesName && <bdi>{track.seriesName}</bdi>}
                {track.seriesName && (hasParts || track.duration > 0) && ' · '}
                {hasParts &&
                  (track.partCount
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
              className={cn(
                'rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30',
                focusRing,
              )}
              aria-label={t('moveUp')}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => move(e.currentTarget, index, index + 1)}
              disabled={index === queue.length - 1}
              className={cn(
                'rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30',
                focusRing,
              )}
              aria-label={t('moveDown')}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                removeFromQueue(index);
                // The focused row is gone; keep keyboard focus inside the surface.
                focusFallback?.current?.focus();
              }}
              className={cn(
                'rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground',
                focusRing,
              )}
              aria-label={t('removeFromQueue')}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
