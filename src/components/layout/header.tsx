'use client';

import { useState, useEffect } from 'react';
import { Search, Music, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { togglePlay } from '@/lib/audio-controller';
import { getTransportState, useAudioStore } from '@/stores/audio-store';
import { PlayPauseIcon } from '@/components/player/player-controls';
import { AccountButton } from '@/components/auth/account-button';
import { NotificationBell } from '@/components/notifications/notification-bell';

interface HeaderProps {
  locale: string;
}

export function Header({ locale }: HeaderProps) {
  const t = useTranslations();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const toggleMiniPlayer = useAudioStore((s) => s.toggleMiniPlayer);
  const transport = useAudioStore(getTransportState);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
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
        <Link href={`/${locale}`} className="flex flex-shrink-0 items-center gap-2" aria-label={t('common.appName')}>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">ת</span>
            </div>
            <h1 className={`text-base font-bold text-foreground ${currentTrack ? 'hidden sm:block' : ''}`}>
              {t('common.appName')}
            </h1>
          </div>
        </Link>

        <div className="flex min-w-0 items-center gap-0.5">
          {/* Offline indicator */}
          {isOffline && (
            <div className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/20">
              <WifiOff className="h-3 w-3" />
              <span>{t('common.offline')}</span>
            </div>
          )}

          {/* Now Playing indicator — shows when a track is loaded */}
          {currentTrack && (
            <div className="flex min-w-0 items-center gap-1 rounded-full bg-primary/10 px-1 py-0.5 text-xs font-medium text-primary max-w-[120px] sm:max-w-[160px]">
              <button
                type="button"
                onClick={toggleMiniPlayer}
                className="min-w-0 flex items-center gap-1.5 rounded-full px-1.5 py-0.5 hover:bg-primary/15 transition-colors"
                aria-label={t('player.nowPlaying')}
              >
                <Music className="h-3 w-3 flex-shrink-0" />
                <span className="truncate" dir="auto">
                  {currentTrack.hebrewTitle || currentTrack.title}
                </span>
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="flex-shrink-0 rounded-full p-1 hover:bg-primary/15 transition-colors"
                aria-label={transport === 'paused' ? t('player.play') : t('player.pause')}
              >
                <PlayPauseIcon transport={transport} className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Narrow phones: the now-playing pill takes the bell's place (it is also on the account page). */}
          <span className={currentTrack ? 'hidden sm:contents' : 'contents'}>
            <NotificationBell />
          </span>
          <AccountButton />

          <Link
            href={`/${locale}/search`}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
            aria-label={t('common.search')}
          >
            <Search className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
