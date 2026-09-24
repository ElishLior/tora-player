'use client';

import { Bookmark } from 'lucide-react';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { BookmarkGroups } from '@/components/bookmarks/bookmark-groups';

interface BookmarksPageClientProps {
  locale: string;
}

export function BookmarksPageClient({ locale }: BookmarksPageClientProps) {
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const isRTL = locale === 'he';

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <h1 className="text-2xl font-bold">
        {isRTL ? 'סימניות' : 'Bookmarks'}
      </h1>

      {bookmarks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-[hsl(var(--surface-elevated))] p-5 mb-4">
            <Bookmark className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold mb-1">
            {isRTL ? 'אין סימניות עדיין' : 'No bookmarks yet'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {isRTL
              ? 'לחץ על כפתור הסימניה בנגן כדי לשמור רגעים חשובים'
              : 'Tap the bookmark button in the player to save important moments'}
          </p>
        </div>
      ) : (
        <BookmarkGroups bookmarks={bookmarks} locale={locale} />
      )}
    </div>
  );
}
