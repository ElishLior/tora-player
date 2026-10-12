export const dynamic = 'force-dynamic';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import {
  getCachedCategoriesTree,
  getCachedCategoryLessonCounts,
  getCachedRecentLessons,
  getCachedShortLessons,
} from '@/lib/supabase/anon';
import { jerusalemDateString } from '@/lib/lesson-week-groups';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { BookOpen, Upload, ChevronLeft } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import { HomeIntro } from '@/components/home/home-intro';
import { ContinueListeningSection } from '@/components/home/continue-listening-section';
import { LatestLessonHero } from '@/components/home/latest-lesson-hero';
import { LatestLessonsSection } from '@/components/home/latest-lessons-section';
import { ShortsSection } from '@/components/home/shorts-section';
import { CategoriesSection } from '@/components/home/categories-section';
import { NowPlayingPanel } from '@/components/player/now-playing-panel';
import type { CategoryWithChildren, LessonWithRelations } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
};

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

  if (isSupabaseConfigured()) {
    try {
      [recentLessons, categories, counts, { lessons: recentShorts }] = await Promise.all([
        getCachedRecentLessons(10),
        getCachedCategoriesTree(),
        getCachedCategoryLessonCounts(),
        getCachedShortLessons(5),
      ]);
    } catch (error) {
      console.error('Home page: failed to load lessons', error);
    }
  }

  // The week groups are labelled from the Israeli calendar day, not the server's (UTC) one.
  const today = jerusalemDateString();

  // The newest lesson is the hero; the sections below continue from the next one.
  const [latestLesson, ...olderLessons] = recentLessons;

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="sr-only">{t('welcome')}</h1>

      {admin && (
        <Link
          href="/lessons/upload"
          className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground transition-colors hover:bg-primary/90"
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

      {/* From 1360px, while something is loaded, the now-playing panel sits at the inline end; otherwise the feed takes the full width. */}
      <div className="flex items-start gap-6">
        <div className="grid min-w-0 flex-1 gap-7">
          <HomeIntro />

          <ContinueListeningSection title={t('continueListening')} />

          {latestLesson ? (
            <LatestLessonHero eyebrow={t('todayLesson')} lesson={latestLesson} />
          ) : (
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
          )}

          <LatestLessonsSection lessons={olderLessons} today={today} />

          <ShortsSection lessons={recentShorts} />

          <CategoriesSection categories={categories} counts={counts} />
        </div>

        {/* NowPlayingPanel renders nothing without a track, so the empty aside collapses. */}
        <aside className="hidden w-[280px] flex-shrink-0 self-stretch empty:hidden min-[1360px]:block">
          <NowPlayingPanel />
        </aside>
      </div>
    </div>
  );
}
