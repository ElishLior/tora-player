import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAllPlaylists } from '@/lib/supabase/queries';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { ListMusic, Plus } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export default async function PlaylistsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('playlists');

  const supabase = await createServerSupabaseClient();
  let playlists: Awaited<ReturnType<typeof getAllPlaylists>> = [];
  if (supabase) {
    try {
      playlists = await getAllPlaylists(supabase);
    } catch {
      // default already set
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <button className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" />
          {t('create')}
        </button>
      </div>

      {playlists.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((pl) => (
            <Link
              key={pl.id}
              href={`/playlists/${pl.id}`}
              className="rounded-xl border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-all"
            >
              <h3 className="text-lg font-semibold" dir="rtl">
                {pl.hebrew_name || pl.name}
              </h3>
              {pl.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2" dir="rtl">
                  {pl.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={ListMusic} title={t('noPlaylists')} />
      )}
    </div>
  );
}
