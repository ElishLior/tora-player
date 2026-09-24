import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAllSeries } from '@/lib/supabase/queries';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { ChevronLeft, Library, Plus, Scissors } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import type { Series } from '@/types/database';

type Props = { params: Promise<{ locale: string }> };

export default async function SeriesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('series');
  const tShorts = await getTranslations('shorts');
  const tCommon = await getTranslations('common');
  const admin = await isAdmin();

  const supabase = await createServerSupabaseClient();
  let series: Series[] = [];
  if (supabase) {
    try {
      series = await getAllSeries(supabase);
    } catch (error) {
      console.error('Failed to load series:', error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {admin && (
          <Link
            href="/lessons/upload"
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>{tCommon('add')}</span>
          </Link>
        )}
      </div>

      <Link
        href="/shorts"
        className="flex items-center gap-3 rounded-xl bg-[hsl(var(--surface-elevated))] p-4 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
      >
        <Scissors className="h-5 w-5 text-rose-400" />
        <span className="flex-1 text-sm font-semibold">{tShorts('title')}</span>
        <ChevronLeft className="h-4 w-4 text-muted-foreground rtl:rotate-0 ltr:rotate-180" />
      </Link>

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
        <EmptyState icon={Library} title={t('noSeries')} />
      )}
    </div>
  );
}
