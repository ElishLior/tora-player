import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { FEED_PATH, SITE_DESCRIPTION, SITE_NAME, absoluteUrl, pageUrl } from '@/config/site';
import { buildPodcastFeed, loadFeedLessons, type FeedLesson } from '@/lib/podcast-feed';
import { createAnonSupabaseClient } from '@/lib/supabase/anon';

export const revalidate = 900;

/** Site-wide podcast feed: every published lesson except short clips, one episode per audio part. */
export async function GET() {
  let lessons: FeedLesson[] = [];
  try {
    lessons = await loadFeedLessons(createAnonSupabaseClient());
  } catch (error) {
    // At runtime a failure keeps serving the last generated feed. `next build`
    // prerenders this route and CI builds have no database: emit an empty feed
    // that the first revalidation replaces.
    if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw error;
    console.warn('[feed.xml] database unavailable at build, prerendering an empty feed:', error);
  }

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
