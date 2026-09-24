export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AlertTriangle, ArrowRight, Hash } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseLessonListReader, loadInitialLessonList } from '@/lib/supabase/lesson-list';
import { tagFromSegment, tagPath } from '@/lib/tag-links';
import { isAdmin } from '@/lib/auth/admin';
import { EmptyState } from '@/components/shared/empty-state';
import { LessonsClient } from '../../lessons/lessons-client';

type Props = {
  params: Promise<{ locale: string; tag: string }>;
};

export default async function TagPage({ params }: Props) {
  const { locale, tag: segment } = await params;
  setRequestLocale(locale);
  const tag = tagFromSegment(segment);
  if (!tag) notFound();

  const t = await getTranslations('tagBrowse');
  const commonT = await getTranslations('common');
  const supabase = await createServerSupabaseClient();
  const admin = await isAdmin();

  const result = await loadInitialLessonList(
    supabase ? createSupabaseLessonListReader(supabase) : null,
    { tagFilter: tag },
  );
  if (!result.ok) {
    console.error('Failed to load tag page:', { tag, code: result.code, message: result.message });
  }
  const count = result.tagCounts.find((row) => row.tag === tag)?.lesson_count;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <Link
          href="/tags"
          aria-label={t('allTags')}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-highlight))] hover:text-foreground"
        >
          <ArrowRight className="h-5 w-5 ltr:rotate-180" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-primary">
            <bdi>#{tag}</bdi>
          </h1>
          {count !== undefined && (
            <p className="text-xs text-muted-foreground">{t('lessonCount', { count })}</p>
          )}
        </div>
      </div>

      {!result.ok ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('loadFailed')}
          action={
            <Link
              href={tagPath(tag)}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {commonT('retry')}
            </Link>
          }
        />
      ) : result.lessons.length === 0 ? (
        <EmptyState
          icon={Hash}
          title={t('tagEmpty')}
          action={
            <Link href="/tags" className="text-sm font-medium text-primary hover:underline">
              {t('allTags')}
            </Link>
          }
        />
      ) : (
        <LessonsClient
          key={tag}
          initialLessons={result.lessons}
          initialHasMore={result.hasMore}
          locale={locale}
          tagFilter={tag}
          showPlayAll
          admin={admin}
          categories={result.allCategories}
        />
      )}
    </div>
  );
}
