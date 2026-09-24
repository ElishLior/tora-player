'use client';

import { Home, BookOpen, Scissors, ListMusic, Bookmark, Download } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAudioStore } from '@/stores/audio-store';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '', label: 'home', icon: Home },
  { href: '/lessons', label: 'lessons', icon: BookOpen },
  { href: '/shorts', label: 'shorts', icon: Scissors },
  { href: '/bookmarks', label: 'bookmarks', icon: Bookmark },
  { href: '/playlists', label: 'playlists', icon: ListMusic },
  { href: '/offline', label: 'downloads', icon: Download },
] as const;

export function BottomNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  // Narrow selectors: the store updates currentTime ~4x a second during playback.
  const hasMiniPlayer = useAudioStore((s) => s.currentTrack !== null);
  const isMiniPlayerExpanded = useAudioStore((s) => s.isMiniPlayerExpanded);

  // Hide when full player is open
  if (isMiniPlayerExpanded) return null;

  return (
    <nav
      className={cn(
        'fixed inset-x-0 z-40 border-t border-[hsl(0,0%,18%)] bg-background safe-area-bottom',
        hasMiniPlayer ? 'bottom-[56px]' : 'bottom-0'
      )}
      role="navigation"
      aria-label={t('label')}
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const fullHref = `/${locale}${item.href}`;
          const isActive =
            item.href === ''
              ? pathname === `/${locale}` || pathname === `/${locale}/`
              : pathname.startsWith(fullHref);

          return (
            <Link
              key={item.href}
              href={fullHref}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 min-w-[52px] transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon
                className={cn('h-5 w-5', isActive && 'stroke-[2.5]')}
              />
              <span className={cn(
                'text-[10px] leading-tight',
                isActive ? 'font-bold' : 'font-medium'
              )}>
                {t(item.label)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
