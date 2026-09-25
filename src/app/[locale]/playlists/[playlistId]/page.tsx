import { cache } from 'react';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPlaylistWithLessons } from '@/lib/supabase/queries';
import { notFound } from 'next/navigation';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { PlayLessonsButtons } from '@/components/lessons/play-lessons-buttons';
import { Link } from '@/i18n/routing';
import { ArrowRight, BookOpen } from 'lucide-react';
import type { LessonWithRelations } from '@/types/database';
import { SITE_TAGLINE, playlistPath } from '@/config/site';
import { pageAlternates, truncateText } from '@/lib/seo';

type Props = { params: Promise<{ locale: string; playlistId: string }> };

/** One playlist lookup per request, shared by generateMetadata and the page. */
const loadPlaylist = cache(async (playlistId: string) => {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  return getPlaylistWithLessons(supabase, playlistId).catch(() => null);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { playlistId } = await params;
  const playlist = await loadPlaylist(playlistId);
  if (!playlist) return {};
  const name = playlist.hebrew_name || playlist.name;
  return {
    title: name,
    description: truncateText(playlist.description || `${name} — ${SITE_TAGLINE.he}`),
    alternates: pageAlternates(playlistPath(playlist.id)),
  };
}

export default async function PlaylistDetailPage({ params }: Props) {
  const { locale, playlistId } = await params;
  setRequestLocale(locale);

  const playlist = await loadPlaylist(playlistId);
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
      </div>

      {items.length > 0 && <PlayLessonsButtons lessons={items.map((item) => item.lesson).filter(Boolean)} />}

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
