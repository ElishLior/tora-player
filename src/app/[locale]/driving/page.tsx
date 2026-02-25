'use client';

import { useEffect, useCallback } from 'react';
import { Play, Pause, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAudioPlayer } from '@/hooks/use-audio-player';

/* ── Inline SVGs for skip icons (large, high-contrast) ── */

function Skip15BackLarge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5V1L7 5l5 4V5" />
      <path d="M19.07 7.93A8 8 0 1 1 7 5.3" />
      <text x="12" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="bold" fontFamily="system-ui">15</text>
    </svg>
  );
}

function Skip15ForwardLarge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5V1l5 4-5 4V5" />
      <path d="M4.93 7.93A8 8 0 1 0 17 5.3" />
      <text x="12" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="bold" fontFamily="system-ui">15</text>
    </svg>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DrivingModePage() {
  const router = useRouter();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    skipForward,
    skipBackward,
  } = useAudioPlayer();

  // Keep screen awake while driving mode is active
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake Lock not supported or permission denied
      }
    }
    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLock?.release();
    };
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // No active track state
  if (!currentTrack) {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
        style={{
          backgroundColor: '#000',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <p className="text-white text-2xl font-bold mb-8" dir="rtl">
          אין שיעור פעיל
        </p>
        <button
          onClick={handleClose}
          className="rounded-full p-4 bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="חזרה"
        >
          <X className="h-10 w-10" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{
        backgroundColor: '#000',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* ── Top: Track title & series ── */}
      <div className="flex-shrink-0 pt-8 pb-4 px-6 text-center" dir="rtl">
        <h1 className="text-white text-2xl font-bold leading-tight truncate">
          {currentTrack.hebrewTitle || currentTrack.title}
        </h1>
        {currentTrack.seriesName && (
          <p className="text-white/60 text-base mt-1 truncate">
            {currentTrack.seriesName}
          </p>
        )}
      </div>

      {/* ── Middle-top: Time display ── */}
      <div className="flex-shrink-0 text-center py-6">
        <p className="text-white font-mono font-bold tabular-nums" style={{ fontSize: '2.5rem', lineHeight: 1.2 }}>
          {formatTime(currentTime)}
        </p>
        <p className="text-white/40 text-lg font-mono tabular-nums mt-1">
          / {formatTime(duration)}
        </p>
        {/* Simple progress bar */}
        <div className="mx-auto mt-4 w-3/4 max-w-md h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/70 rounded-full transition-[width] duration-300"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* ── Center: Main controls ── */}
      <div className="flex-1 flex items-center justify-center">
        <div dir="ltr" className="flex items-center justify-center gap-10">
          {/* Skip backward */}
          <button
            onClick={() => skipBackward(15)}
            className="rounded-full p-5 bg-white/10 text-white hover:bg-white/20 active:bg-white/30 transition-colors"
            aria-label="15 שניות אחורה"
          >
            <Skip15BackLarge className="h-14 w-14" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="rounded-full flex items-center justify-center bg-white text-black hover:scale-105 active:scale-95 transition-transform shadow-2xl"
            style={{ width: 120, height: 120 }}
            aria-label={isPlaying ? 'השהה' : 'נגן'}
          >
            {isPlaying ? (
              <Pause className="h-16 w-16 fill-current" />
            ) : (
              <Play className="h-16 w-16 fill-current ml-2" />
            )}
          </button>

          {/* Skip forward */}
          <button
            onClick={() => skipForward(15)}
            className="rounded-full p-5 bg-white/10 text-white hover:bg-white/20 active:bg-white/30 transition-colors"
            aria-label="15 שניות קדימה"
          >
            <Skip15ForwardLarge className="h-14 w-14" />
          </button>
        </div>
      </div>

      {/* ── Bottom: Close button ── */}
      <div className="flex-shrink-0 flex justify-center pb-10 pt-4">
        <button
          onClick={handleClose}
          className="rounded-full p-4 bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          aria-label="סגור מצב נהיגה"
        >
          <X className="h-8 w-8" />
        </button>
      </div>
    </div>
  );
}
