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

  return (
    <div className="space-y-1">
      <div
        ref={barRef}
        className="relative h-6 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted">
          {/* Progress */}
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className="absolute h-4 w-4 rounded-full bg-primary shadow-md transition-[left,right] duration-75"
          style={{
            [document.documentElement.dir === 'rtl' ? 'right' : 'left']: `calc(${progress}% - 8px)`,
          }}
        />
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatDuration(Math.round(displayTime))}</span>
        <span>{duration > 0 ? formatDuration(Math.round(duration)) : '--:--'}</span>
      </div>
    </div>
  );
}
