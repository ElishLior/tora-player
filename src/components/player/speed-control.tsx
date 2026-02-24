'use client';

import { useState, useRef, useEffect } from 'react';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface SpeedControlProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export function SpeedControl({ speed, onSpeedChange }: SpeedControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const isCustomSpeed = speed !== 1;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums transition-colors min-w-[3rem] ${
          isCustomSpeed
            ? 'border-primary text-primary'
            : 'border-[hsl(0,0%,30%)] text-muted-foreground hover:text-foreground hover:border-foreground'
        }`}
        aria-label={`Playback speed: ${speed}x`}
      >
        {speed}x
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 start-1/2 -translate-x-1/2 bg-[hsl(var(--surface-elevated))] border border-[hsl(0,0%,20%)] rounded-xl shadow-2xl p-1 z-50 min-w-[80px]">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onSpeedChange(opt);
                setIsOpen(false);
              }}
              className={`block w-full rounded-lg px-4 py-2 text-sm tabular-nums text-center transition-colors ${
                opt === speed
                  ? 'bg-primary/20 text-primary font-bold'
                  : 'text-foreground hover:bg-[hsl(var(--surface-highlight))]'
              }`}
            >
              {opt}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
