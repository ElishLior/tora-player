'use client';

import { Loader2, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { TransportState } from '@/stores/audio-store';

interface SkipButtonProps {
  direction: 'back' | 'forward';
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
}

/**
 * The one skip control used by every player surface: "back" always rewinds
 * 15s, "forward" always advances 30s, and the icons are never mirrored.
 * Render back → play → forward in DOM order; the document direction then puts
 * "back" on the right in Hebrew (as in Hebrew audio apps) and on the left in English.
 */
export function SkipButton({
  direction,
  onClick,
  disabled,
  className,
  iconClassName,
  labelClassName,
}: SkipButtonProps) {
  const t = useTranslations('player');
  const isBack = direction === 'back';
  const Icon = isBack ? RotateCcw : RotateCw;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t(isBack ? 'skipBackward' : 'skipForward')}
      className={cn('flex flex-col items-center gap-1 transition-colors disabled:opacity-30', className)}
    >
      <Icon aria-hidden className={iconClassName} />
      <span aria-hidden className={cn('text-[11px] font-bold leading-none tabular-nums', labelClassName)}>
        {t(isBack ? 'skipBackwardShort' : 'skipForwardShort')}
      </span>
    </button>
  );
}

/** Pause while sound plays, a spinner while loading (tapping still pauses), else play. */
export function PlayPauseIcon({ transport, className }: { transport: TransportState; className?: string }) {
  if (transport === 'playing') return <Pause aria-hidden className={cn('fill-current', className)} />;
  if (transport === 'loading') return <Loader2 aria-hidden className={cn('animate-spin', className)} />;
  // The triangle always points right; nudge it physically to look centred.
  return <Play aria-hidden className={cn('fill-current translate-x-[8%]', className)} />;
}
