import { setRequestLocale, getTranslations } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedAllSeries } from '@/lib/supabase/anon';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { ListLoadError } from '@/components/shared/list-load-error';
import { PageHeader } from '@/components/shared/page-header';
import { CardGrid } from '@/components/shared/card-grid';
import { CollectionCard } from '@/components/shared/collection-card';
import { CoverTile } from '@/components/lessons/reading-cover';
import { ChevronLeft, Library, Plus, Scissors } from 'lucide-react';
import { isAdmin } from '@/lib/auth/admin';
import { embeddedCount } from '@/lib/embedded-count';
import { readingHue } from '@/lib/lesson-display';
import type { Series } from '@/types/database';

type Props = { params: Promise<{ locale: string }> };

export default async function SeriesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('series');
  const tShorts = await getTranslations('shorts');
  const tCommon = await getTranslations('common');
  const tDesign = await getTranslations('pagesDesign');
  const admin = await isAdmin();

  let series: (Series & { lessons?: unknown })[] = [];
  let failed = false;
  if (isSupabaseConfigured()) {
    try {
      series = await getCachedAllSeries();
    } catch (error) {
      console.error('Failed to load series:', error);
      failed = true;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          admin && (
            <Link
              href="/lessons/upload"
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Plus className="h-4 w-4" />
              <span>{tCommon('add')}</span>
            </Link>
          )
        }
      />

      <Link
        href="/shorts"
        className="flex items-center gap-3 rounded-2xl bg-[hsl(var(--surface-elevated))] p-3 transition-colors duration-150 hover:bg-[hsl(var(--surface-highlight))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none lg:[@media(hover:hover)]:hover:bg-[hsl(var(--surface-highlight))]"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rose-400/15 text-rose-400"
        >
          <Scissors className="h-5 w-5" />
        </span>
        <span className="flex-1 text-base font-bold">{tShorts('title')}</span>
        <ChevronLeft aria-hidden="true" className="h-5 w-5 text-muted-foreground ltr:rotate-180" />
      </Link>

      {failed ? (
        <ListLoadError />
      ) : series.length > 0 ? (
        <CardGrid variant="tiles">
          {series.map((s) => {
            const name = s.hebrew_name || s.name;
            const count = embeddedCount(s, 'lessons');
            return (
              <CollectionCard
                key={s.id}
                href={`/series/${s.id}`}
                title={name}
                description={s.description}
                meta={count === null ? null : tDesign('lessonCount', { count })}
                cover={
                  <CoverTile
                    text={name}
                    hue={readingHue(s.id)}
                    className="aspect-[16/9] w-full"
                    textClassName="line-clamp-2 text-xl"
                  />
                }
              />
            );
          })}
        </CardGrid>
      ) : (
        <EmptyState icon={Library} title={t('noSeries')} />
      )}
    </div>
  );
}
