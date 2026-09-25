import { unstable_cache } from 'next/cache';
import { FEED_PATH, SITE_DESCRIPTION, SITE_NAME, absoluteUrl, pageUrl } from '@/config/site';
import { buildPodcastFeed, loadFeedLessons } from '@/lib/podcast-feed';
import { createAnonSupabaseClient } from '@/lib/supabase/anon';

// CI has no database: generate the first feed from live data on the first request.
export const dynamic = 'force-dynamic';
const getFeedLessons = unstable_cache(
  () => loadFeedLessons(createAnonSupabaseClient()),
  ['podcast-feed', 'main'],
  { revalidate: 900, tags: ['catalog'] },
);

/** Site-wide podcast feed: published non-short lessons, one episode per audio file. */
export async function GET() {
  const lessons = await getFeedLessons();

  const xml = buildPodcastFeed(
    {
      title: SITE_NAME.he,
      description: SITE_DESCRIPTION.he,
      link: pageUrl('/'),
      feedUrl: absoluteUrl(FEED_PATH),
    },
    lessons,
  );
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
