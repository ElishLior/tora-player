import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAllPlaylists } from '@/lib/supabase/queries';
import { EmptyState } from '@/components/shared/empty-state';
import { ListLoadError } from '@/components/shared/list-load-error';
import { PageHeader } from '@/components/shared/page-header';
import { CardGrid } from '@/components/shared/card-grid';
import { CollectionCard } from '@/components/shared/collection-card';
import { CoverTile } from '@/components/lessons/reading-cover';
import { embeddedCount } from '@/lib/embedded-count';
import { readingHue } from '@/lib/lesson-display';
import { ListMusic, Plus } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export default async function PlaylistsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('playlists');
  const tDesign = await getTranslations('pagesDesign');

  const supabase = await createServerSupabaseClient();
  let playlists: Awaited<ReturnType<typeof getAllPlaylists>> = [];
  let failed = false;
  if (supabase) {
    try {
      playlists = await getAllPlaylists(supabase);
    } catch {
      failed = true;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <button className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            <Plus className="h-4 w-4" />
            {t('create')}
          </button>
        }
      />

      {failed ? (
        <ListLoadError />
      ) : playlists.length > 0 ? (
        <CardGrid variant="tiles">
          {playlists.map((pl) => {
            const name = pl.hebrew_name || pl.name;
            const count = embeddedCount(pl, 'playlist_lessons');
            return (
              <CollectionCard
                key={pl.id}
                href={`/playlists/${pl.id}`}
                title={name}
                description={pl.description}
                meta={count === null ? null : tDesign('lessonCount', { count })}
                cover={
                  <CoverTile
                    text={name}
                    hue={readingHue(pl.id)}
                    className="aspect-[16/9] w-full"
                    textClassName="line-clamp-2 text-xl"
                  />
                }
              />
            );
          })}
        </CardGrid>
      ) : (
        <EmptyState icon={ListMusic} title={t('noPlaylists')} />
      )}
    </div>
  );
}
