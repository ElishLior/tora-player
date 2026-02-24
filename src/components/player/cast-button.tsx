'use client';

import { useTranslations } from 'next-intl';
import { useCast } from '@/hooks/use-cast';
import { useAudioStore } from '@/stores/audio-store';

/** Google Cast / broadcast icon */
function CastIcon({ className, connected }: { className?: string; connected?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      {/* Outer screen frame */}
      <path
        d="M1 18V21H4C4 19.35 2.65 18 1 18Z"
        fill={connected ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1 14V16C3.76 16 6 18.24 6 21H8C8 17.13 4.87 14 1 14Z"
        fill={connected ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1 10V12C5.97 12 10 16.03 10 21H12C12 14.92 7.07 10 1 10Z"
        fill={connected ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 3H3C1.9 3 1 3.9 1 5V8H3V5H21V19H14V21H21C22.1 21 23 20.1 23 19V5C23 3.9 22.1 3 21 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface CastButtonProps {
  /** 'full' = button with label (for full player), 'mini' = icon only (for mini player) */
  variant?: 'full' | 'mini' | 'icon';
  className?: string;
}

export function CastButton({ variant = 'full', className = '' }: CastButtonProps) {
  const t = useTranslations('player');
  const { isAvailable, isConnected, deviceName, startCasting, stopCasting } = useCast();
  const currentTrack = useAudioStore((s) => s.currentTrack);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isConnected) {
      stopCasting();
      return;
    }

    if (isAvailable && currentTrack) {
      const audioUrl = currentTrack.audioUrl;
      const title = currentTrack.hebrewTitle || currentTrack.title;
      const subtitle = currentTrack.seriesName || '';
      await startCasting(audioUrl, title, subtitle);
      return;
    }

    // If Cast SDK loaded but no track, still open the device picker
    if (isAvailable) {
      await startCasting('', '');
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        className={`p-2 transition-colors ${
          isConnected
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
        } ${className}`}
        aria-label={isConnected ? `${t('cast')} - ${deviceName}` : t('cast')}
        title={isConnected ? `${t('cast')}: ${deviceName}` : t('cast')}
      >
        <CastIcon className="h-5 w-5" connected={isConnected} />
      </button>
    );
  }

  if (variant === 'mini') {
    return (
      <button
        onClick={handleClick}
        className={`p-2 transition-colors ${
          isConnected
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
        } ${className}`}
        aria-label={isConnected ? `${t('cast')} - ${deviceName}` : t('cast')}
      >
        <CastIcon className="h-4 w-4" connected={isConnected} />
      </button>
    );
  }

  // Full variant — icon + label (for full player secondary actions)
  return (
    <button
      onClick={handleClick}
      className={`flex flex-col items-center gap-1.5 transition-colors ${
        isConnected
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground'
      } ${className}`}
      aria-label={isConnected ? `${t('cast')} - ${deviceName}` : t('cast')}
    >
      <CastIcon className="h-5 w-5" connected={isConnected} />
      <span className="text-[10px]">
        {isConnected ? deviceName : t('cast')}
      </span>
    </button>
  );
}
