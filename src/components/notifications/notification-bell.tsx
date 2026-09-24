'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/components/notifications/use-push-notifications';

/**
 * Header bell: one tap turns new-lesson push notifications on/off for this
 * device. Where push needs an extra step (iOS Safari tab, blocked permission)
 * the tap opens a short explanation instead.
 */
export function NotificationBell() {
  const t = useTranslations('notifications');
  const { status, busy, error, enable, disable } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (error) setOpen(true);
  }, [error]);

  if (status === 'checking' || status === 'unavailable') return null;

  async function handleClick() {
    if (status === 'on') {
      await disable();
      setOpen(false);
    } else if (status === 'off') {
      await enable();
    } else {
      setOpen((value) => !value);
    }
  }

  const label = status === 'on' ? t('bell.turnOff') : t('bell.turnOn');
  const Icon = busy ? Loader2 : status === 'on' ? BellRing : status === 'off' ? Bell : BellOff;
  const message =
    status === 'ios-install'
      ? t('iosInstall')
      : status === 'denied'
        ? t('denied')
        : error === 'sw-timeout'
          ? t('errors.swTimeout')
          : error
            ? t('errors.failed')
            : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={label}
        title={label}
        aria-pressed={status === 'on'}
        className={`rounded-full p-2 transition-colors hover:bg-primary/10 ${
          status === 'on' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Icon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
      </button>

      {open && message && (
        <div
          role="status"
          className="absolute end-0 top-full z-50 mt-2 w-64 rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-3 text-start text-xs leading-relaxed shadow-xl"
        >
          {message}
        </div>
      )}
    </div>
  );
}
