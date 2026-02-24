'use client';

import { useCallback, useRef, useState } from 'react';
import { formatDuration } from '@/lib/utils';

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export function SeekBar({ currentTime, duration, onSeek }: SeekBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  const getTimeFromPosition = useCallback((clientX: number) => {
    if (!barRef.current || !duration) return 0;
    const rect = barRef.current.getBoundingClientRect();
    // Handle RTL - in RTL, the progress goes right to left
    const isRTL = document.documentElement.dir === 'rtl';
    let ratio: number;
    if (isRTL) {
      ratio = (rect.right - clientX) / rect.width;
    } else {
      ratio = (clientX - rect.left) / rect.width;
    }
    return Math.max(0, Math.min(duration, ratio * duration));
  }, [duration]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    const time = getTimeFromPosition(e.clientX);
    setDragTime(time);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getTimeFromPosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const time = getTimeFromPosition(e.clientX);
    setDragTime(time);
  }, [isDragging, getTimeFromPosition]);

  const handlePointerUp = useCallback(() => {
    if (isDragging) {
      onSeek(dragTime);
      setIsDragging(false);
    }
  }, [isDragging, dragTime, onSeek]);

  const displayTime = isDragging ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const remaining = duration > 0 ? duration - displayTime : 0;
  const showThumb = isDragging || isHovering;

  return (
    <div className="space-y-1.5">
      <div
        ref={barRef}
        className="group relative h-5 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Track — thin by default, slightly taller on hover */}
        <div className={`absolute inset-x-0 rounded-full bg-[hsl(0,0%,24%)] transition-all ${
          showThumb ? 'h-1' : 'h-0.5'
        }`}>
          {/* Progress — green */}
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${
              showThumb ? 'bg-primary' : 'bg-foreground'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Thumb — white dot, only visible on hover/drag */}
        {showThumb && (
          <div
            className="absolute h-3 w-3 rounded-full bg-foreground shadow-lg transition-[left,right] duration-75"
            style={{
              [document.documentElement.dir === 'rtl' ? 'right' : 'left']: `calc(${progress}% - 6px)`,
            }}
          />
        )}
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{formatDuration(Math.round(displayTime))}</span>
        <span>{duration > 0 ? `-${formatDuration(Math.round(remaining))}` : '--:--'}</span>
      </div>
    </div>
  );
}
