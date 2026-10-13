export const dynamic = 'force-dynamic';

import { cache } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedSeriesById, getCachedSeriesLessons } from '@/lib/supabase/anon';
import { notFound } from 'next/navigation';
import { LessonCard } from '@/components/lessons/lesson-card';
import { LessonCardList } from '@/components/lessons/lesson-card-list';
import { EmptyState } from '@/components/shared/empty-state';
import { PlayLessonsButtons } from '@/components/lessons/play-lessons-buttons';
import { CollectionHeader } from '@/components/shared/collection-header';
import { CoverTile } from '@/components/lessons/reading-cover';
import { Link } from '@/i18n/routing';
import { ArrowRight, BookOpen } from 'lucide-react';
import type { LessonWithRelations } from '@/types/database';
import { JsonLd } from '@/components/seo/json-ld';
import { DEFAULT_LOCALE, SITE_NAME, SITE_TAGLINE, seriesFeedPath, seriesPath } from '@/config/site';
import { breadcrumbJsonLd, pageAlternates, seriesJsonLd, truncateText } from '@/lib/seo';
import { readingHue } from '@/lib/lesson-display';

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
    [series, lessons] = await Promise.all([loadSeries(seriesId), getCachedSeriesLessons(seriesId)]);
  } catch {
    notFound();
  }

  if (!series) notFound();

  const tCommon = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'common' });
  const tDesign = await getTranslations('pagesDesign');
  const name = series.hebrew_name || series.name;

  const seriesLessons = lessons.map((lesson) => ({ ...lesson, series }) as LessonWithRelations);

  return (
    <div className="space-y-6">
      <JsonLd
        data={[
          seriesJsonLd(series, seriesFeedPath(series.id)),
          breadcrumbJsonLd([
            { name: SITE_NAME.he, pathname: '/' },
            { name: tCommon('series'), pathname: '/series' },
            { name, pathname: seriesPath(series.id) },
          ]),
        ]}
      />
      <CollectionHeader
        hue={readingHue(series.id)}
        eyebrow={tDesign('eyebrow.series')}
        title={name}
        description={series.description}
        cover={
          <CoverTile
            text={name}
            hue={readingHue(series.id)}
            className="h-28 w-28 sm:h-36 sm:w-36"
            textClassName="line-clamp-3 text-lg"
          />
        }
        back={
          <Link
            href="/series"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
            {tCommon('series')}
          </Link>
        }
        actions={
          /* The rows carry no series; attach it so the player shows and links the series name. */
          lessons.length > 0 && <PlayLessonsButtons lessons={seriesLessons} continueSeries />
        }
      />

      {lessons.length > 0 ? (
        <LessonCardList>
          {seriesLessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </LessonCardList>
      ) : (
        <EmptyState icon={BookOpen} title={tDesign('series.emptyLessons')} />
      )}
    </div>
  );
}
