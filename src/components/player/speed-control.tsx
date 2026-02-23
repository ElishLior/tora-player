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

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-full px-2.5 py-1 text-xs font-bold tabular-nums hover:bg-muted transition-colors min-w-[3rem]"
        aria-label={`Playback speed: ${speed}x`}
      >
        {speed}x
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 start-1/2 -translate-x-1/2 bg-popover border rounded-xl shadow-lg p-1 z-50">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onSpeedChange(opt);
                setIsOpen(false);
              }}
              className={`block w-full rounded-lg px-4 py-1.5 text-sm tabular-nums text-start transition-colors ${
                opt === speed ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
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
