'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { useAppUpdate } from '@/hooks/use-app-update';
import { cn } from '@/lib/utils';

/**
 * A passive pill for a newer deployed build. It never takes focus and never
 * reloads by itself: "Refresh" is the user's choice, and it is disabled while
 * audio plays. "Later" snoozes this build only.
 */
export function AppUpdateBanner() {
  const t = useTranslations('appUpdate');
  const update = useAppUpdate();

  if (!update.target && !update.recovery) return null;

  if (!update.target) {
    return (
      <div
        role="status"
        className="fixed inset-x-3 top-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-3 text-start shadow-2xl motion-safe:duration-200 motion-safe:animate-in motion-safe:fade-in-0"
      >
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t('recovery')}</p>
        <button
          type="button"
          onClick={update.dismissRecovery}
          className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          {t('later')}
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="fixed inset-x-3 top-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-3 text-start shadow-2xl motion-safe:duration-200 motion-safe:animate-in motion-safe:fade-in-0"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{t('available')}</p>
        {update.playing && <p className="mt-0.5 text-xs text-muted-foreground">{t('pausedFirst')}</p>}
      </div>
      <button
        type="button"
        onClick={update.snooze}
        className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {t('later')}
      </button>
      <button
        type="button"
        onClick={update.refresh}
        disabled={update.playing}
        className={cn(
          'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t('refresh')}
      </button>
    </div>
  );
}
