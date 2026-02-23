'use client';

import { Home, BookOpen, Search, ListMusic } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAudioStore } from '@/stores/audio-store';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  labelHe: string;
  labelEn: string;
  icon: typeof Home;
}

const navItems: NavItem[] = [
  { href: '', labelHe: 'בית', labelEn: 'Home', icon: Home },
  { href: '/lessons', labelHe: 'שיעורים', labelEn: 'Lessons', icon: BookOpen },
  { href: '/search', labelHe: 'חיפוש', labelEn: 'Search', icon: Search },
  { href: '/playlists', labelHe: 'רשימות', labelEn: 'Playlists', icon: ListMusic },
];

export function BottomNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const { currentTrack, isMiniPlayerExpanded } = useAudioStore();

  // Hide when full player is open
  if (isMiniPlayerExpanded) return null;

  const isRTL = locale === 'he';
  const hasMiniPlayer = !!currentTrack;

  return (
    <nav
      className={cn(
        'fixed inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-lg safe-area-bottom',
        hasMiniPlayer ? 'bottom-[60px]' : 'bottom-0'
      )}
      role="navigation"
      aria-label="Main navigation"
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
                'flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px] transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon
                className={cn('h-5 w-5', isActive && 'stroke-[2.5]')}
              />
              <span className="text-[10px] font-medium leading-tight">
                {isRTL ? item.labelHe : item.labelEn}
              </span>
              {isActive && (
                <div className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
