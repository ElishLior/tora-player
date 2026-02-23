import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAllBookmarks } from '@/lib/supabase/queries';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { Bookmark } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

type Props = { params: Promise<{ locale: string }> };

export default async function BookmarksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('bookmarks');

  const supabase = await createServerSupabaseClient();
  let bookmarks: Awaited<ReturnType<typeof getAllBookmarks>> = [];
  if (supabase) {
    try {
      bookmarks = await getAllBookmarks(supabase);
    } catch {
      // default already set
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {bookmarks.length > 0 ? (
        <div className="space-y-3">
          {bookmarks.map((bm) => (
            <Link
              key={bm.id}
              href={`/lessons/${bm.lesson_id}?t=${bm.position}`}
              className="block rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium" dir="rtl">
                    {bm.note || formatDuration(bm.position)}
                  </p>
                  {bm.lesson && (
                    <p className="text-sm text-muted-foreground" dir="rtl">
                      {(bm.lesson as { hebrew_title?: string }).hebrew_title || bm.lesson.title}
                    </p>
                  )}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums flex-shrink-0">
                  {formatDuration(bm.position)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={Bookmark} title={t('noBookmarks')} />
      )}
    </div>
  );
}
