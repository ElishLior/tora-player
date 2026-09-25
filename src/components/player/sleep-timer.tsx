'use client';

import { useEffect, useRef, useState } from 'react';
import { Moon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn, formatDuration } from '@/lib/utils';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { useAudioStore, type SleepTimer } from '@/stores/audio-store';

const MINUTE_OPTIONS = [15, 30, 45, 60];

interface SleepTimerControlProps {
  /** Classes for the trigger, to match the surrounding action row. */
  className?: string;
}

/**
 * Sleep timer: stop after N minutes, at the end of the part, or at the end of
 * the lesson. The audio controller enforces it; this only sets and shows it.
 */
export function SleepTimerControl({ className }: SleepTimerControlProps) {
  const t = useTranslations('player');
  const sleepTimer = useAudioStore((s) => s.sleepTimer);
  const setSleepTimer = useAudioStore((s) => s.setSleepTimer);
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const queue = useAudioStore((s) => s.queue);
  const hasParts = !!currentTrack && (
    (currentTrack.partCount ?? 0) > 1 ||
    (currentTrack.partCount === undefined && !!currentTrack.audioFileId &&
      queue.some((track) => !!track.audioFileId && track.audioFileId !== currentTrack.audioFileId &&
        getTrackLessonId(track) === getTrackLessonId(currentTrack)))
  );
  const [isOpen, setIsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  // Tick the countdown label once a second while a minutes timer runs.
  useEffect(() => {
    if (sleepTimer?.kind !== 'minutes') return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sleepTimer]);

  const remaining = sleepTimer?.kind === 'minutes' ? Math.max(0, (sleepTimer.endsAt - now) / 1000) : 0;
  const status =
    sleepTimer?.kind === 'minutes'
      ? t('sleepRemaining', { time: formatDuration(remaining) })
      : sleepTimer?.kind === 'end-of-part'
        ? t('sleepAtEndOfPart')
        : sleepTimer?.kind === 'end-of-lesson'
          ? t('sleepAtEndOfLesson')
          : null;

  const choose = (timer: SleepTimer | null) => {
    setSleepTimer(timer);
    setIsOpen(false);
  };

  // Minute timers start counting when chosen, not when the menu opened.
  const options: { label: string; pick: () => SleepTimer | null; active: boolean }[] = [
    { label: t('sleepOff'), pick: () => null, active: sleepTimer === null },
    ...MINUTE_OPTIONS.map((minutes) => ({
      label: t('sleepMinutes', { minutes }),
      pick: (): SleepTimer => ({ kind: 'minutes', endsAt: Date.now() + minutes * 60_000 }),
      active: false,
    })),
    ...(hasParts
      ? [{ label: t('sleepEndOfPart'), pick: (): SleepTimer => ({ kind: 'end-of-part' }), active: sleepTimer?.kind === 'end-of-part' }]
      : []),
    {
      label: t('sleepEndOfLesson'),
      pick: (): SleepTimer => ({ kind: 'end-of-lesson' }),
      active: sleepTimer?.kind === 'end-of-lesson',
    },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={status ? `${t('sleepTimer')}: ${status}` : t('sleepTimer')}
        className={cn(className, sleepTimer && 'text-primary hover:text-primary')}
      >
        <Moon className={`h-5 w-5 ${sleepTimer ? 'fill-current' : ''}`} aria-hidden />
        <span className="text-[10px] whitespace-nowrap tabular-nums">
          {sleepTimer?.kind === 'minutes' ? formatDuration(remaining) : t('sleepTimer')}
        </span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute bottom-full left-1/2 z-50 mb-2 min-w-[9rem] -translate-x-1/2 rounded-xl border border-[hsl(0,0%,20%)] bg-[hsl(var(--surface-elevated))] p-1 shadow-2xl"
        >
          {status && <p className="px-3 py-1.5 text-center text-[11px] text-muted-foreground">{status}</p>}
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitemradio"
              aria-checked={option.active}
              onClick={() => choose(option.pick())}
              className={`block w-full rounded-lg px-4 py-2 text-center text-sm transition-colors ${
                option.active
                  ? 'bg-primary/20 font-bold text-primary'
                  : 'text-foreground hover:bg-[hsl(var(--surface-highlight))]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
