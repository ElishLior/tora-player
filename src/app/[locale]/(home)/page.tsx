export const dynamic = 'force-dynamic';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import {
  getCachedCategoriesTree,
  getCachedCategoryLessonTotals,
  getCachedRecentLessons,
  getCachedShortLessons,
} from '@/lib/supabase/anon';
import { jerusalemDateString } from '@/lib/lesson-week-groups';
import { EmptyState } from '@/components/shared/empty-state';
import { ListLoadError } from '@/components/shared/list-load-error';
import { Link } from '@/i18n/routing';
import { BookOpen, Upload, ChevronLeft } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import { HomeIntro } from '@/components/home/home-intro';
import { ContinueListeningSection } from '@/components/home/continue-listening-section';
import { LatestLessonHero } from '@/components/home/latest-lesson-hero';
import { LatestLessonsSection } from '@/components/home/latest-lessons-section';
import { ShortsSection } from '@/components/home/shorts-section';
import { CategoriesSection } from '@/components/home/categories-section';
import type { CategoryWithChildren, LessonWithRelations } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
};

/*
 * Desktop order (lg and up): the latest lesson first, then the intro, the continue strip,
 * the week lists, and shorts + categories side by side from xl. Phones keep the DOM order
 * (intro, continue, lesson, lists), because the order classes apply from lg only.
 * The continue strip is hidden from xl, where the now-playing panel shows the same lesson.
 */
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tUpload = await getTranslations('upload.entry');

  const admin = await isAdmin();

  let recentLessons: LessonWithRelations[] = [];
  let recentShorts: LessonWithRelations[] = [];
  let categories: CategoryWithChildren[] = [];
  let counts: Record<string, number> = {};
  let failed = false;

  if (isSupabaseConfigured()) {
    try {
      [recentLessons, categories, counts, { lessons: recentShorts }] = await Promise.all([
        getCachedRecentLessons(10),
        getCachedCategoriesTree(),
        getCachedCategoryLessonTotals(),
        getCachedShortLessons(5),
      ]);
    } catch (error) {
      console.error('Home page: failed to load lessons', error);
      failed = true;
    }
  }

  // The week groups are labelled from the Israeli calendar day, not the server's (UTC) one.
  const today = jerusalemDateString();

  // The newest lesson is the hero; the sections below continue from the next one.
  const [latestLesson, ...olderLessons] = recentLessons;

  return (
    <div className="animate-fade-in">
      <h1 className="sr-only">{t('welcome')}</h1>

      <div className="grid gap-7">
        {/* -mb-1: the column gap is 28px, so the upload entry sits 24px above the intro as it always did on phones. */}
        {admin && (
          <Link
            href="/lessons/upload"
            className="-mb-1 flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground transition-colors hover:bg-primary/90 lg:order-2"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <Upload className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold">{tUpload('cta')}</span>
              <span className="block text-xs opacity-80">{tUpload('hint')}</span>
            </span>
            <ChevronLeft className="h-5 w-5 flex-shrink-0 ltr:rotate-180" />
          </Link>
        )}

        <HomeIntro className="lg:order-3" />

        {/* From xl the now-playing panel shows this same lesson, so the strip is hidden there. */}
        <ContinueListeningSection title={t('continueListening')} className="lg:order-4 xl:hidden" />

        {failed ? (
          <div className="lg:order-1">
            <ListLoadError />
          </div>
        ) : latestLesson ? (
          <LatestLessonHero
            className="lg:order-1"
            eyebrow={latestLesson.date === today ? t('todayLesson') : t('latestLesson')}
            lesson={latestLesson}
          />
        ) : (
          <div className="lg:order-1">
            <EmptyState
              icon={BookOpen}
              title={locale === 'he' ? 'אין שיעורים עדיין' : 'No lessons yet'}
              description={
                locale === 'he'
                  ? admin
                    ? 'הוסף שיעור ראשון כדי להתחיל'
                    : 'שיעורים יתווספו בקרוב'
                  : admin
                    ? 'Add your first lesson to get started'
                    : 'Lessons will be added soon'
              }
              action={
                admin ? (
                  <Link
                    href="/lessons/upload"
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:scale-105 hover:bg-primary/90"
                  >
                    {locale === 'he' ? 'הוספת שיעור' : 'Add Lesson'}
                  </Link>
                ) : undefined
              }
            />
          </div>
        )}

        <LatestLessonsSection lessons={olderLessons} today={today} className="lg:order-5" />

        {(recentShorts.length > 0 || categories.length > 0) && (
          // Shorts and categories side by side from xl (pane 672px and up: two columns of about 300px).
          <div className="grid gap-7 lg:order-6 xl:grid-cols-2 xl:gap-6">
            <ShortsSection lessons={recentShorts} />
            <CategoriesSection categories={categories} counts={counts} />
          </div>
        )}
      </div>
    </div>
  );
}
