'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAudioStore } from '@/stores/audio-store';
import { cn } from '@/lib/utils';
import { BROWSE_NAV, isNavActive, PRIMARY_NAV, type NavItem } from './nav-items';

/**
 * Desktop side menu (lg and up; phones and tablets use BottomNav). It is the
 * first column of the layout row, so `dir` puts it on the right in Hebrew and
 * on the left in English. It stays in view while the page scrolls and stops
 * above the mini player.
 */
export function SideNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const hasMiniPlayer = useAudioStore((s) => s.currentTrack !== null);

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
    <aside className="hidden w-60 flex-shrink-0 border-e border-border/50 lg:block xl:w-64">
      <nav
        aria-label={t('sidebarLabel')}
        className={cn(
          'sticky top-12 flex flex-col gap-6 overflow-y-auto px-3 py-5',
          // Header is h-12; the desktop player bar (h-24, DESKTOP_PLAYER_BAR_CLASS) covers the bottom while a track is loaded.
          hasMiniPlayer ? 'h-[calc(100dvh-3rem-6rem-env(safe-area-inset-bottom))]' : 'h-[calc(100dvh-3rem)]',
        )}
      >
        <ul className="space-y-0.5">{PRIMARY_NAV.map(renderItem)}</ul>
        <div className="space-y-2">
          <p className="px-3 text-xs font-bold text-muted-foreground/80">{t('browse')}</p>
          <ul className="space-y-0.5">{BROWSE_NAV.map(renderItem)}</ul>
        </div>
      </nav>
    </aside>
  );
}
