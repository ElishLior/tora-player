'use client';

import { SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { seekTo, skipBackward, skipForward, togglePlay } from '@/lib/audio-controller';
import { cn } from '@/lib/utils';
import { getTransportState, useAudioStore } from '@/stores/audio-store';
import { PlayPauseIcon, SkipButton } from './player-controls';
import { SeekBar } from './seek-bar';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/**
 * Transport of the desktop players: previous lesson (only with a queue neighbour),
 * back 15s, play/pause, forward 15s, next lesson. DOM order is back → play → forward
 * and `dir` mirrors it. Selectors are narrow on purpose: the position changes ~4 times
 * a second, and only the timeline needs it.
 */
export function TransportControls({ className }: { className?: string }) {
  const t = useTranslations('player');
  const transport = useAudioStore((s) => getTransportState(s));
  const hasPreviousTrack = useAudioStore((s) => s.queueIndex > 0);
  const hasNextTrack = useAudioStore((s) => s.queueIndex < s.queue.length - 1);
  const previousTrack = useAudioStore((s) => s.previousTrack);
  const nextTrack = useAudioStore((s) => s.nextTrack);

  return (
    <div className={cn('flex items-center justify-center gap-1.5', className)}>
      <div className="flex h-11 w-11 items-center justify-center">
        {hasPreviousTrack && (
          <button
            type="button"
            onClick={previousTrack}
            aria-label={t('previousTrack')}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
              focusRing,
            )}
          >
            <SkipBack aria-hidden="true" className="h-5 w-5 rtl:-scale-x-100" />
          </button>
        )}
      </div>

      <SkipButton
        direction="back"
        onClick={skipBackward}
        className={cn(
          'h-11 min-w-11 justify-center rounded-full px-1 text-muted-foreground hover:text-foreground',
          focusRing,
        )}
        iconClassName="h-5 w-5"
        labelClassName="text-[13px]"
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={transport === 'paused' ? t('play') : t('pause')}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100',
          focusRing,
        )}
      >
        <PlayPauseIcon transport={transport} className="h-5 w-5" />
      </button>

      <SkipButton
        direction="forward"
        onClick={skipForward}
        className={cn(
          'h-11 min-w-11 justify-center rounded-full px-1 text-muted-foreground hover:text-foreground',
          focusRing,
        )}
        iconClassName="h-5 w-5"
        labelClassName="text-[13px]"
      />

      <div className="flex h-11 w-11 items-center justify-center">
        {hasNextTrack && (
          <button
            type="button"
            onClick={nextTrack}
            aria-label={t('nextTrack')}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
              focusRing,
            )}
          >
            <SkipForward aria-hidden="true" className="h-5 w-5 rtl:-scale-x-100" />
          </button>
        )}
      </div>
    </div>
  );
}

/** The loaded part's seek bar with elapsed and total time underneath, through the controller's seekTo. */
export function PlaybackTimeline({ className }: { className?: string }) {
  const currentTime = useAudioStore((s) => s.currentTime);
  const duration = useAudioStore((s) => s.duration);
  return (
    <div className={className}>
      <SeekBar currentTime={currentTime} duration={duration} onSeek={seekTo} timeMode="total" />
    </div>
  );
}

/** Playback volume through the store (the controller pushes it to the element). */
export function VolumeControl({ className }: { className?: string }) {
  const t = useTranslations('player');
  const volume = useAudioStore((s) => s.volume);
  const setVolume = useAudioStore((s) => s.setVolume);
  const percent = Math.round(volume * 100);

  return (
    <div className={cn('flex h-11 items-center gap-2 text-muted-foreground', className)}>
      <Volume2 aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
      {/* LTR so a higher value always sits toward the end of the slider, whatever the page direction. */}
      <input
        type="range"
        dir="ltr"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => setVolume(Number(event.target.value) / 100)}
        aria-label={t('volume')}
        aria-valuetext={`${percent}%`}
        className={cn('h-1 w-24 cursor-pointer rounded-full accent-primary', focusRing)}
      />
    </div>
  );
}
