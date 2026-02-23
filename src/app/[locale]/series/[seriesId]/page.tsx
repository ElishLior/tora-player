import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSeriesById, getLessonsBySeries } from '@/lib/supabase/queries';
import { notFound } from 'next/navigation';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { ArrowRight, BookOpen } from 'lucide-react';
import type { LessonWithRelations } from '@/types/database';

type Props = { params: Promise<{ locale: string; seriesId: string }> };

export default async function SeriesDetailPage({ params }: Props) {
  const { locale, seriesId } = await params;
  setRequestLocale(locale);

  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  let series, lessons;
  try {
    [series, lessons] = await Promise.all([
      getSeriesById(supabase, seriesId),
      getLessonsBySeries(supabase, seriesId),
    ]);
  } catch {
    notFound();
  }

  if (!series) notFound();

  return (
    <div className="space-y-6">
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
