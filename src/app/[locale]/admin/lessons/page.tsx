export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { createCatalogLessonListReader } from '@/lib/supabase/anon';
import { loadInitialLessonList } from '@/lib/supabase/lesson-list';
import { ListLoadError } from '@/components/shared/list-load-error';
import { LessonsClient } from '../../lessons/lessons-client';

type Props = { params: Promise<{ locale: string }> };

/**
 * Lesson management in the admin panel: the bulk category bar lives here, not on
 * the regular lesson lists (owner, October 13, 2026). Lists published lessons;
 * each lesson's edit page (pencil on its page) edits one lesson, drafts included.
 */
export default async function AdminLessonsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect(`/${locale}/admin/login?from=/${locale}/admin/lessons`);
  const t = await getTranslations('adminLessons');
  const BackArrow = locale === 'he' ? ArrowRight : ArrowLeft;

  const result = await loadInitialLessonList(isSupabaseConfigured() ? createCatalogLessonListReader() : null, {});

  return (
    <div className="mx-auto grid max-w-5xl gap-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/admin`}
          aria-label={t('back')}
          className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <BackArrow className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {result.ok ? (
        <LessonsClient
          initialLessons={result.lessons}
          initialHasMore={result.hasMore}
          locale={locale}
          bulkCategoryEdit
          categories={result.allCategories}
        />
      ) : (
        <ListLoadError />
      )}
    </div>
  );
}
