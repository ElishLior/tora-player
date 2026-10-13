import { cache } from 'react';
import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPlaylistWithLessons } from '@/lib/supabase/queries';
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
import { SITE_TAGLINE, playlistPath } from '@/config/site';
import { pageAlternates, truncateText } from '@/lib/seo';
import { readingHue } from '@/lib/lesson-display';

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
  const tDesign = await getTranslations('pagesDesign');
  const tCommon = await getTranslations('common');
  const name = playlist.hebrew_name || playlist.name;

  return (
    <div className="space-y-6">
      <CollectionHeader
        hue={readingHue(playlist.id)}
        eyebrow={tDesign('eyebrow.playlist')}
        title={name}
        description={playlist.description}
        cover={
          <CoverTile
            text={name}
            hue={readingHue(playlist.id)}
            className="h-28 w-28 sm:h-36 sm:w-36"
            textClassName="line-clamp-3 text-lg"
          />
        }
        back={
          <Link
            href="/playlists"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
            {tCommon('playlists')}
          </Link>
        }
        actions={items.length > 0 && <PlayLessonsButtons lessons={items.map((item) => item.lesson).filter(Boolean)} />}
      />

      {items.length > 0 ? (
        // Same rows as every list (one column, two and three on wide panes); the gap matches the old space-y-3 on phones.
        <LessonCardList className="gap-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex min-w-0 items-center gap-3">
              <span className="w-6 flex-shrink-0 text-center text-sm text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <LessonCard lesson={item.lesson} />
              </div>
            </div>
          ))}
        </LessonCardList>
      ) : (
        <EmptyState icon={BookOpen} title={tDesign('playlists.emptyPlaylist')} />
      )}
    </div>
  );
}
