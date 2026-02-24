import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAllSeries } from '@/lib/supabase/queries';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { Library, Plus } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export default async function SeriesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('series');

  const supabase = await createServerSupabaseClient();
  let series: Awaited<ReturnType<typeof getAllSeries>> = [];
  if (supabase) {
    try {
      series = await getAllSeries(supabase);
    } catch {
      // default already set
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link
          href="/lessons/upload"
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>{locale === 'he' ? 'העלה קטע' : 'Upload'}</span>
        </Link>
      </div>

      {series.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {series.map((s) => (
            <Link
              key={s.id}
              href={`/series/${s.id}`}
              className="rounded-xl border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-all"
            >
              <h3 className="text-lg font-semibold" dir="rtl">
                {s.hebrew_name || s.name}
              </h3>
              {s.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2" dir="rtl">
                  {s.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center space-y-4 py-12">
          <EmptyState icon={Library} title={t('noSeries')} />
          <Link
            href="/lessons/upload"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>{locale === 'he' ? 'העלה קטע קצר ראשון' : 'Upload first short clip'}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
