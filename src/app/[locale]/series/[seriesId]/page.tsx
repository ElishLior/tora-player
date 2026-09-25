export const dynamic = 'force-dynamic';

import { cache } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedSeriesById, getCachedSeriesLessons } from '@/lib/supabase/anon';
import { notFound } from 'next/navigation';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { PlayLessonsButtons } from '@/components/lessons/play-lessons-buttons';
import { Link } from '@/i18n/routing';
import { ArrowRight, BookOpen } from 'lucide-react';
import type { LessonWithRelations } from '@/types/database';
import { JsonLd } from '@/components/seo/json-ld';
import { DEFAULT_LOCALE, SITE_NAME, SITE_TAGLINE, seriesFeedPath, seriesPath } from '@/config/site';
import { breadcrumbJsonLd, pageAlternates, seriesJsonLd, truncateText } from '@/lib/seo';

type Props = { params: Promise<{ locale: string; seriesId: string }> };

/** One series lookup per request, shared by generateMetadata and the page. */
const loadSeries = cache((seriesId: string) => getCachedSeriesById(seriesId).catch(() => null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesId } = await params;
  const series = await loadSeries(seriesId);
  if (!series) return {};
  const name = series.hebrew_name || series.name;
  return {
    title: name,
    description: truncateText(series.description || `${name} — ${SITE_TAGLINE.he}`),
    alternates: pageAlternates(seriesPath(series.id), [{ url: seriesFeedPath(series.id), title: name }]),
  };
}

export default async function SeriesDetailPage({ params }: Props) {
  const { locale, seriesId } = await params;
  setRequestLocale(locale);

  if (!isSupabaseConfigured()) notFound();

  let series, lessons;
  try {
    [series, lessons] = await Promise.all([
      loadSeries(seriesId),
      getCachedSeriesLessons(seriesId),
    ]);
  } catch {
    notFound();
  }

  if (!series) notFound();

  const tCommon = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'common' });

  return (
    <div className="space-y-6">
      <JsonLd
        data={[
          seriesJsonLd(series, seriesFeedPath(series.id)),
          breadcrumbJsonLd([
            { name: SITE_NAME.he, pathname: '/' },
            { name: tCommon('series'), pathname: '/series' },
            { name: series.hebrew_name || series.name, pathname: seriesPath(series.id) },
          ]),
        ]}
      />
      <div className="flex items-center gap-3">
        <Link href="/series" className="rounded-full p-2 hover:bg-muted transition-colors">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold" dir="rtl">{series.hebrew_name || series.name}</h1>
          {series.description && (
            <p className="text-muted-foreground mt-1" dir="rtl">{series.description}</p>
          )}
        </div>
      </div>

      {lessons.length > 0 && (
        <PlayLessonsButtons
          // The rows carry no series; the player shows its name.
          lessons={lessons.map((lesson) => ({ ...lesson, series }) as LessonWithRelations)}
          continueSeries
        />
      )}

      {lessons.length > 0 ? (
        <div className="space-y-3">
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson as LessonWithRelations} showProgress />
          ))}
        </div>
      ) : (
        <EmptyState icon={BookOpen} title={locale === 'he' ? 'אין שיעורים בסדרה' : 'No lessons in this series'} />
      )}
    </div>
  );
}
