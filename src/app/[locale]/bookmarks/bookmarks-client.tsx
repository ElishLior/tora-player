'use client';

import { useMemo } from 'react';
import { Bookmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { BookmarkGroups } from '@/components/bookmarks/bookmark-groups';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { useLessonsByIds } from '@/hooks/use-lessons-by-ids';
import { useHydrated } from '@/hooks/use-hydrated';
import type { LessonWithRelations } from '@/types/database';

interface BookmarksPageClientProps {
  locale: string;
}

export function BookmarksPageClient({ locale }: BookmarksPageClientProps) {
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const hydrated = useHydrated();
  const t = useTranslations('bookmarks');
  const tDesign = useTranslations('pagesDesign');

  // The lessons' covers and links come from the published catalog. Offline (or if the read
  // fails) the groups still show, with the title each bookmark stored.
  const lessonIds = useMemo(() => [...new Set(bookmarks.map((bm) => bm.lessonId))].sort(), [bookmarks]);
  const { lessons } = useLessonsByIds(lessonIds, hydrated);
  const lessonsById = useMemo(
    () => (lessons.size > 0 ? (Object.fromEntries(lessons) as Record<string, LessonWithRelations>) : null),
    [lessons],
  );

  return (
    <div className="space-y-6" dir={locale === 'he' ? 'rtl' : 'ltr'}>
      <PageHeader icon={Bookmark} iconClassName="text-primary" title={t('title')} />

      {bookmarks.length === 0 ? (
        <EmptyState icon={Bookmark} title={t('noBookmarks')} description={tDesign('bookmarks.hint')} />
      ) : (
        <BookmarkGroups bookmarks={bookmarks} locale={locale} lessons={lessonsById} />
      )}
    </div>
  );
}
