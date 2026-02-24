'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';

interface HeaderProps {
  locale: string;
}

export function Header({ locale }: HeaderProps) {
  const isRTL = locale === 'he';

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-12 items-center justify-between px-4">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">ת</span>
            </div>
            <h1 className="text-base font-bold text-foreground">
              {isRTL ? 'נגן תורה' : 'Tora Player'}
            </h1>
          </div>
        </Link>

        <div className="flex items-center gap-0.5">
          <Link
            href={`/${locale}/search`}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
            aria-label={isRTL ? 'חיפוש' : 'Search'}
          >
            <Search className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
