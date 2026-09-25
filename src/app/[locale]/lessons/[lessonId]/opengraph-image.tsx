import { SITE_NAME, SITE_TAGLINE } from '@/config/site';
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from '@/lib/og-image';
import { createAnonSupabaseClient } from '@/lib/supabase/anon';
import { formatDuration } from '@/lib/utils';

export const alt = SITE_NAME.he;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

interface PreviewLesson {
  title: string;
  hebrew_title: string | null;
  date: string | null;
  hebrew_date: string | null;
  duration: number | null;
  series: { name: string; hebrew_name: string | null } | null;
}

/**
 * The lesson's link preview: title, series, date and length. Read with the
 * cookie-less anon client (crawlers are signed out), so drafts and unknown ids
 * get the generic brand card. Cached at the edge for an hour so title edits
 * show up.
 */
export default async function Image({ params }: { params: { lessonId: string } }) {
  let lesson: PreviewLesson | null = null;
  try {
    const { data, error } = await createAnonSupabaseClient()
      .from('lessons')
      .select('title, hebrew_title, date, hebrew_date, duration, series(name, hebrew_name)')
      .eq('id', params.lessonId)
      .maybeSingle();
    if (error) throw error;
    lesson = data as PreviewLesson | null;
  } catch (error) {
    console.error('[opengraph-image] lesson lookup failed:', error);
  }

  const card = lesson
    ? {
        title: lesson.hebrew_title || lesson.title,
        subtitle: lesson.series?.hebrew_name || lesson.series?.name,
        facts: [
          lesson.hebrew_date,
          lesson.date?.split('-').reverse().join('.'),
          lesson.duration ? formatDuration(lesson.duration) : null,
        ],
      }
    : { title: SITE_NAME.he, subtitle: SITE_TAGLINE.he };

  return renderOgImage(card, {
    'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  });
}
