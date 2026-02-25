'use client';

import { useState, useEffect } from 'react';
import { Search, Play, Pause, Music, Shield } from 'lucide-react';
import Link from 'next/link';
import { useAudioStore } from '@/stores/audio-store';

interface HeaderProps {
  locale: string;
}

export function Header({ locale }: HeaderProps) {
  const isRTL = locale === 'he';
  const { currentTrack, isPlaying, togglePlay, toggleMiniPlayer } = useAudioStore();
  const [isAdminVisible, setIsAdminVisible] = useState(false);

  useEffect(() => {
    // Check the non-httpOnly cookie for admin visibility
    const hasAdminCookie = document.cookie.split(';').some(c => c.trim().startsWith('tora-admin-visible='));
    setIsAdminVisible(hasAdminCookie);
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
          {/* Now Playing indicator — shows when a track is loaded */}
          {currentTrack && (
            <button
              onClick={toggleMiniPlayer}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors max-w-[140px]"
              aria-label={isRTL ? 'מתנגן כעת' : 'Now Playing'}
            >
              <Music className="h-3 w-3 flex-shrink-0" />
              <span className="truncate" dir="rtl">
                {currentTrack.hebrewTitle || currentTrack.title}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="flex-shrink-0 p-0.5"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="h-3 w-3 fill-current" />
                ) : (
                  <Play className="h-3 w-3 fill-current" />
                )}
              </button>
            </button>
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
