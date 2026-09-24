'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDuration } from '@/lib/utils';

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const KEYBOARD_STEP_SECONDS = 5;

/** Progress runs from the inline start: right-to-left in Hebrew, left-to-right in English. */
export function SeekBar({ currentTime, duration, onSeek }: SeekBarProps) {
  const t = useTranslations('player');
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  const getTimeFromPosition = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    const isRTL = getComputedStyle(bar).direction === 'rtl';
    const ratio = isRTL ? (rect.right - clientX) / rect.width : (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(duration, ratio * duration));
  }, [duration]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    setDragTime(getTimeFromPosition(e.clientX));
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getTimeFromPosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragTime(getTimeFromPosition(e.clientX));
  }, [isDragging, getTimeFromPosition]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    onSeek(dragTime);
    setIsDragging(false);
  }, [isDragging, dragTime, onSeek]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!duration) return;
    // Arrow keys follow the visual direction of the bar.
    const isRTL = barRef.current ? getComputedStyle(barRef.current).direction === 'rtl' : false;
    const forwardKey = isRTL ? 'ArrowLeft' : 'ArrowRight';
    const backKey = isRTL ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === forwardKey || e.key === 'ArrowUp') onSeek(Math.min(duration, currentTime + KEYBOARD_STEP_SECONDS));
    else if (e.key === backKey || e.key === 'ArrowDown') onSeek(Math.max(0, currentTime - KEYBOARD_STEP_SECONDS));
    else return;
    e.preventDefault();
  }, [currentTime, duration, onSeek]);

  const displayTime = isDragging ? dragTime : currentTime;
  const progress = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const remaining = duration > 0 ? Math.max(0, duration - displayTime) : 0;
  const showThumb = isDragging || isHovering;

  return (
    <div className="space-y-1.5">
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label={t('seek')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(displayTime)}
        aria-valuetext={formatDuration(Math.round(displayTime))}
        className="group relative h-5 flex items-center cursor-pointer touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onKeyDown={handleKeyDown}
      >
        <div className={`absolute inset-x-0 rounded-full bg-[hsl(0,0%,24%)] transition-all ${showThumb ? 'h-1' : 'h-0.5'}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${showThumb ? 'bg-primary' : 'bg-foreground'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {showThumb && (
          <div
            className="absolute h-3 w-3 rounded-full bg-foreground shadow-lg"
            style={{ insetInlineStart: `calc(${progress}% - 6px)` }}
          />
        )}
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <bdi>{formatDuration(Math.round(displayTime))}</bdi>
        <bdi dir="ltr">{duration > 0 ? `-${formatDuration(Math.round(remaining))}` : '--:--'}</bdi>
      </div>
    </div>
  );
}
