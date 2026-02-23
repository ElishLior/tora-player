'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';

interface HeaderProps {
  locale: string;
}

export function Header({ locale }: HeaderProps) {
  const isRTL = locale === 'he';

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-primary">
            {isRTL ? 'נגן תורה' : 'Tora Player'}
          </h1>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href={`/${locale}/search`}
            className="rounded-full p-2 hover:bg-muted transition-colors"
            aria-label={isRTL ? 'חיפוש' : 'Search'}
          >
            <Search className="h-4 w-4" />
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
