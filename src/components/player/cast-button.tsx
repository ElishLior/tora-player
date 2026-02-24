'use client';

import { useCallback, useState } from 'react';

/** Google Cast / broadcast icon */
function CastIcon({ className, connected }: { className?: string; connected?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
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
  variant?: 'full' | 'mini' | 'icon';
  label?: string;
  className?: string;
}

export function CastButton({ variant = 'full', label = 'שדר', className = '' }: CastButtonProps) {
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;

      // If already connected, disconnect
      if (connected && w.cast?.framework) {
        const ctx = w.cast.framework.CastContext.getInstance();
        ctx.endCurrentSession(true);
        setConnected(false);
        setDeviceName(null);
        return;
      }

      // Try to load Cast SDK if not loaded
      if (!w.cast?.framework) {
        // Load SDK dynamically
        await new Promise<void>((resolve) => {
          if (w.cast?.framework) { resolve(); return; }

          w['__onGCastApiAvailable'] = (available: boolean) => {
            if (available) {
              try {
                const ctx = w.cast.framework.CastContext.getInstance();
                ctx.setOptions({
                  receiverApplicationId: 'CC1AD845',
                  autoJoinPolicy: 'ORIGIN_SCOPED',
                });
              } catch { /* ignore */ }
            }
            resolve();
          };

          const script = document.createElement('script');
          script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
          script.async = true;
          script.onerror = () => resolve();
          document.head.appendChild(script);

          setTimeout(resolve, 8000);
        });
      }

      // Try to start a cast session
      if (w.cast?.framework) {
        const ctx = w.cast.framework.CastContext.getInstance();
        await ctx.requestSession();
        const session = ctx.getCurrentSession?.();
        if (session) {
          setConnected(true);
          setDeviceName(session.getCastDevice?.()?.friendlyName || 'Cast Device');
        }
      }
    } catch {
      // User cancelled or Cast not available — silently ignore
    }
  }, [connected]);

  const colorClass = connected
    ? 'text-primary'
    : 'text-muted-foreground hover:text-foreground';

  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        className={`p-2 transition-colors ${colorClass} ${className}`}
        aria-label={connected ? `Cast: ${deviceName}` : 'Cast'}
      >
        <CastIcon className="h-5 w-5" connected={connected} />
      </button>
    );
  }

  if (variant === 'mini') {
    return (
      <button
        onClick={handleClick}
        className={`p-2 transition-colors ${colorClass} ${className}`}
        aria-label={connected ? `Cast: ${deviceName}` : 'Cast'}
      >
        <CastIcon className="h-4 w-4" connected={connected} />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`flex flex-col items-center gap-1.5 transition-colors ${colorClass} ${className}`}
      aria-label={connected ? `Cast: ${deviceName}` : 'Cast'}
    >
      <CastIcon className="h-5 w-5" connected={connected} />
      <span className="text-[10px]">
        {connected ? deviceName : label}
      </span>
    </button>
  );
}
