'use client';

import { useState, useEffect } from 'react';
import { Search, Play, Pause, Music, Shield, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useAudioStore } from '@/stores/audio-store';

interface HeaderProps {
  locale: string;
}

export function Header({ locale }: HeaderProps) {
  const isRTL = locale === 'he';
  const { currentTrack, isPlaying, togglePlay, toggleMiniPlayer } = useAudioStore();
  const [isAdminVisible, setIsAdminVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Check the non-httpOnly cookie for admin visibility
    const hasAdminCookie = document.cookie.split(';').some(c => c.trim().startsWith('tora-admin-visible='));
    setIsAdminVisible(hasAdminCookie);

    // Track online/offline status
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-12 items-center justify-between px-4">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">ת</span>
            </div>
            <h1 className="text-base font-bold text-foreground">
              {isRTL ? 'נגן תורה' : 'Tora Player'}
            </h1>
          </div>
        </Link>

        <div className="flex items-center gap-0.5">
          {/* Offline indicator */}
          {isOffline && (
            <div className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/20">
              <WifiOff className="h-3 w-3" />
              <span>{isRTL ? 'אופליין' : 'Offline'}</span>
            </div>
          )}

          {/* Now Playing indicator — shows when a track is loaded */}
          {currentTrack && (
            <div className="flex items-center gap-1 rounded-full bg-primary/10 px-1 py-0.5 text-xs font-medium text-primary max-w-[160px]">
              <button
                type="button"
                onClick={toggleMiniPlayer}
                className="min-w-0 flex items-center gap-1.5 rounded-full px-1.5 py-0.5 hover:bg-primary/15 transition-colors"
                aria-label={isRTL ? 'מתנגן כעת' : 'Now Playing'}
              >
                <Music className="h-3 w-3 flex-shrink-0" />
                <span className="truncate" dir="rtl">
                  {currentTrack.hebrewTitle || currentTrack.title}
                </span>
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="flex-shrink-0 rounded-full p-1 hover:bg-primary/15 transition-colors"
                aria-label={isPlaying ? (isRTL ? 'השהה' : 'Pause') : isRTL ? 'נגן' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="h-3 w-3 fill-current" />
                ) : (
                  <Play className="h-3 w-3 fill-current" />
                )}
              </button>
            </div>
          )}

          {isAdminVisible && (
            <Link
              href={`/${locale}/admin`}
              className="rounded-full p-2 text-primary/70 hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label={isRTL ? 'ניהול' : 'Admin'}
            >
              <Shield className="h-4 w-4" />
            </Link>
          )}

          <Link
            href={`/${locale}/search`}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
            aria-label={isRTL ? 'חיפוש' : 'Search'}
          >
            <Search className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
