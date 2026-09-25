import { SITE_TAGLINE, absoluteUrl, pageUrl, seriesFeedPath, seriesPath } from '@/config/site';
import { buildPodcastFeed, loadFeedLessons } from '@/lib/podcast-feed';
import { createAnonSupabaseClient } from '@/lib/supabase/anon';
import { getSeriesById } from '@/lib/supabase/queries';

export const revalidate = 900;

/** Podcast feed of one series (linked from the series page); includes every published lesson in it. */
export async function GET(_request: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  const supabase = createAnonSupabaseClient();
  const series = await getSeriesById(supabase, seriesId).catch(() => null);
  if (!series) return new Response('Not found', { status: 404 });

  const name = series.hebrew_name || series.name;
  const xml = buildPodcastFeed(
    {
      title: name,
      description: series.description || `${name} — ${SITE_TAGLINE.he}`,
      link: pageUrl(seriesPath(series.id)),
      feedUrl: absoluteUrl(seriesFeedPath(series.id)),
    },
    await loadFeedLessons(supabase, { seriesId: series.id }),
  );
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
