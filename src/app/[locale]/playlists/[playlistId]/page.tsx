import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPlaylistWithLessons } from '@/lib/supabase/queries';
import { notFound } from 'next/navigation';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { ArrowRight, BookOpen, Play } from 'lucide-react';
import type { LessonWithRelations } from '@/types/database';

type Props = { params: Promise<{ locale: string; playlistId: string }> };

export default async function PlaylistDetailPage({ params }: Props) {
  const { locale, playlistId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('playlists');

  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  let playlist;
  try {
    playlist = await getPlaylistWithLessons(supabase, playlistId);
  } catch {
    notFound();
  }

  if (!playlist) notFound();

  const items = (playlist as { playlist_lessons?: { lesson: LessonWithRelations }[] }).playlist_lessons || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/playlists" className="rounded-full p-2 hover:bg-muted transition-colors">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" dir="rtl">{playlist.hebrew_name || playlist.name}</h1>
          {playlist.description && (
            <p className="text-muted-foreground mt-1" dir="rtl">{playlist.description}</p>
          )}
        </div>
        {items.length > 0 && (
          <button className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Play className="h-4 w-4" />
            {t('playAll')}
          </button>
        )}
      </div>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground w-6 text-center">{i + 1}</span>
              <div className="flex-1">
                <LessonCard lesson={item.lesson} showProgress />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={BookOpen} title={locale === 'he' ? 'רשימה ריקה' : 'Empty playlist'} />
      )}
    </div>
  );
}
