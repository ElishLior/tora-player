'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { usePushNotifications } from '@/components/notifications/use-push-notifications';
import { useAudioStore } from '@/stores/audio-store';
import { SHELL_PANE_SURFACE, SHELL_PANE_TOP, shellPaneHeight } from '@/lib/desktop-shell';
import { cn } from '@/lib/utils';
import { BROWSE_NAV, isNavActive, PRIMARY_NAV, type NavItem } from './nav-items';

/**
 * Desktop side menu (lg and up; phones and tablets use BottomNav): the first pane of
 * the desktop shell, at the inline start (right in Hebrew, left in English). It is
 * sticky below the header and scrolls its own content; its height stops above the
 * desktop player bar while a track is loaded (desktop-shell.ts).
 */
export function SideNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const hasPlayerBar = useAudioStore((s) => s.currentTrack !== null);

  const renderItem = (item: NavItem) => {
    const active = isNavActive(pathname, locale, item.href);
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={`/${locale}${item.href}`}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
            active
              ? 'bg-[hsl(var(--surface-elevated))] font-bold text-foreground'
              : 'font-medium text-muted-foreground hover:bg-[hsl(var(--surface-elevated)/0.6)] hover:text-foreground',
          )}
        >
          {active && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-primary" />}
          <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'stroke-[2.5] text-primary')} aria-hidden="true" />
          <span className="truncate">{t(item.label)}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside
      className={cn(
        'hidden w-60 flex-shrink-0 self-start lg:sticky lg:block xl:w-64',
        SHELL_PANE_TOP,
        SHELL_PANE_SURFACE,
        shellPaneHeight(hasPlayerBar, 'sticky'),
      )}
    >
      <nav
        aria-label={t('sidebarLabel')}
        className="flex h-full flex-col gap-6 overflow-y-auto overscroll-contain px-3 py-5"
      >
        <ul className="space-y-0.5">{PRIMARY_NAV.map(renderItem)}</ul>
        <div className="space-y-2">
          <p className="px-3 text-xs font-bold text-muted-foreground/80">{t('browse')}</p>
          <ul className="space-y-0.5">{BROWSE_NAV.map(renderItem)}</ul>
        </div>
        <div className="mt-auto">
          <NotificationsCard />
        </div>
      </nav>
    </aside>
  );
}

/**
 * "שיעור חדש עלה?": turns new-lesson notifications on from the side menu. Shown only
 * while they can still be turned on (`off`); on, denied, unsupported, iOS-in-tab and
 * the first check all render nothing, so the server HTML and the first client render match.
 * Uses the same push flow as the feature intro and the bell.
 */
function NotificationsCard() {
  const t = useTranslations('desktopShell');
  const tPrompt = useTranslations('notificationPrompt');
  const tNotifications = useTranslations('notifications');
  const { status, busy, error, enable } = usePushNotifications();

  if (status !== 'off') return null;

  return (
    <section aria-labelledby="side-notify-title" className="grid gap-3 rounded-xl bg-primary/10 p-4">
      <div className="grid gap-1">
        <h2 id="side-notify-title" className="text-[15px] font-bold text-foreground">
          {t('notifyTitle')}
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t('notifyBody')}</p>
      </div>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        <Bell aria-hidden="true" className="h-4 w-4" />
        {tPrompt('enable')}
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {tNotifications('errors.failed')}
        </p>
      )}
    </section>
  );
}
