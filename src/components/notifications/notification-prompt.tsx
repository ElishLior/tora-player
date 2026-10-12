'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '@/components/notifications/use-push-notifications';
import {
  isPromptRoute,
  notificationPromptView,
  readPromptMemory,
  rememberEnabled,
  rememberNotNow,
  type PromptMemory,
} from '@/lib/notification-prompt';
import { useAudioStore } from '@/stores/audio-store';
import { cn } from '@/lib/utils';

const SHOW_DELAY_MS = 2500;
const ENABLED_HIDE_MS = 3500;

type Variant = 'enable' | 'ios-install' | 'enabled' | 'denied';

/**
 * Non-blocking in-app question: "get an alert when a new lesson is published?".
 * Asks once per device until the visitor says "don't show again", turns
 * notifications on, or snoozes it (see `notificationPromptView`).
 */
export function NotificationPrompt() {
  const t = useTranslations('notificationPrompt');
  const tNotifications = useTranslations('notifications');
  const titleId = useId();
  const bodyId = useId();
  const { status, busy, error, enable } = usePushNotifications();
  const fullPlayerOpen = useAudioStore((s) => s.isMiniPlayerExpanded);
  const hasMiniPlayer = useAudioStore((s) => s.currentTrack !== null);
  const locale = useLocale();
  const pathname = usePathname();

  // Stays null until mounted, so server and first client render match.
  const [memory, setMemory] = useState<PromptMemory | null>(null);
  const [now, setNow] = useState(0);
  const [delayDone, setDelayDone] = useState(false);
  const [installBannerShown, setInstallBannerShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [neverAgainChecked, setNeverAgainChecked] = useState(false);

  useEffect(() => {
    setMemory(readPromptMemory(localStorage));
    setNow(Date.now());
    const timer = window.setTimeout(() => setDelayDone(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // The install banner and this card must not show at the same time.
  useEffect(() => {
    const sync = () => setInstallBannerShown(document.querySelector('[data-install-prompt]') !== null);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Notifications turned on by any surface (this card, the bell, account): never ask again.
  useEffect(() => {
    if (status === 'on' && memory && !memory.neverAgain) setMemory(rememberEnabled(localStorage));
  }, [status, memory]);

  const enabledNow = attempted && status === 'on';
  useEffect(() => {
    if (!enabledNow) return;
    const timer = window.setTimeout(() => setDismissed(true), ENABLED_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [enabledNow]);

  const view = memory
    ? notificationPromptView({ status, neverAgain: memory.neverAgain, snoozedUntil: memory.snoozedUntil, now })
    : null;
  const variant: Variant | null = enabledNow ? 'enabled' : attempted && status === 'denied' ? 'denied' : view;
  const visible =
    variant !== null &&
    memory !== null &&
    delayDone &&
    !dismissed &&
    !fullPlayerOpen &&
    !installBannerShown &&
    isPromptRoute(pathname, locale);

  /** Not now / close / Escape. Only the question itself is remembered; the result card just closes. */
  const closeCard = useCallback(() => {
    if (!memory) return;
    if (variant === 'enable' || variant === 'ios-install') {
      setMemory(rememberNotNow(localStorage, { neverAgain: neverAgainChecked, now: Date.now() }));
    }
    setDismissed(true);
  }, [memory, variant, neverAgainChecked]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCard();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible, closeCard]);

  if (!visible || !variant) return null;

  const errorText =
    variant === 'enable' && error
      ? error === 'sw-timeout'
        ? tNotifications('errors.swTimeout')
        : tNotifications('errors.failed')
      : null;
  const body =
    variant === 'enable'
      ? t('body')
      : variant === 'ios-install'
        ? tNotifications('iosInstall')
        : variant === 'enabled'
          ? tNotifications('on')
          : tNotifications('denied');

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={cn(
        'fixed inset-x-3 z-[45] rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4 text-start shadow-2xl',
        'bottom-[calc(68px+env(safe-area-inset-bottom))]',
        hasMiniPlayer && 'bottom-[calc(124px+env(safe-area-inset-bottom))]',
        'lg:inset-x-auto lg:bottom-6 lg:end-6 lg:w-[360px]',
        hasMiniPlayer && 'lg:bottom-[calc(1.5rem+56px)]',
        'motion-safe:duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:[animation-timing-function:cubic-bezier(0.23,1,0.32,1)]',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-sm font-semibold text-foreground">
            {variant === 'enabled' ? t('enabled') : t('title')}
          </p>
          <p id={bodyId} className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
        <button
          type="button"
          onClick={closeCard}
          aria-label={t('close')}
          className="-me-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {errorText && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {errorText}
        </p>
      )}

      {(variant === 'enable' || variant === 'ios-install') && (
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={neverAgainChecked}
            onChange={(event) => setNeverAgainChecked(event.target.checked)}
            className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span>{t('neverAgain')}</span>
        </label>
      )}

      {variant === 'enable' && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAttempted(true);
              void enable();
            }}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface-elevated))] disabled:opacity-60"
          >
            {t('enable')}
          </button>
          <button
            type="button"
            onClick={closeCard}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('notNow')}
          </button>
        </div>
      )}

      {variant === 'ios-install' && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={closeCard}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[hsl(var(--surface-highlight))] px-5 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--surface-press))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('gotIt')}
          </button>
        </div>
      )}
    </div>
  );
}
