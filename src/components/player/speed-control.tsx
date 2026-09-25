'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface SpeedControlProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export function SpeedControl({ speed, onSpeedChange }: SpeedControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('player');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const isCustomSpeed = speed !== 1;

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums transition-colors min-w-[3rem] ${
          isCustomSpeed
            ? 'border-primary text-primary'
            : 'border-[hsl(0,0%,30%)] text-muted-foreground hover:text-foreground hover:border-foreground'
        }`}
        aria-label={`${t('speed')}: ${speed}x`}
      >
        <bdi>{speed}x</bdi>
      </button>

      {isOpen && (
        // Physical left/translate: centred under the trigger in both directions.
        <div
          role="menu"
          aria-label={t('speed')}
          className="absolute bottom-full left-1/2 z-50 mb-2 min-w-[80px] -translate-x-1/2 rounded-xl border border-[hsl(0,0%,20%)] bg-[hsl(var(--surface-elevated))] p-1 shadow-2xl"
        >
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              role="menuitemradio"
              aria-checked={opt === speed}
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
              <bdi>{opt}x</bdi>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
