import type { SupabaseClient } from '@supabase/supabase-js';
import { getAudioContentType, getAudioDirectUrl } from '@/lib/audio-download';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { PODCAST_COVER_PATH, SITE_AUTHOR, absoluteUrl, lessonUrl } from '@/config/site';
import { lessonDescription, lessonEpisodeAudio, type EpisodeAudio } from '@/lib/seo';
import { LESSON_AUDIO_FILES } from '@/lib/supabase/lesson-selects';
import { SHORT_LESSON_TYPE, SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import type { LessonWithRelations } from '@/types/database';

/*
 * Podcast RSS 2.0 (+ itunes namespace) for podcast apps: one episode per audio
 * part, so a two-part lesson is two episodes with stable GUIDs (lesson_audio id).
 */

/** Supabase returns a bounded page; the feed walks every page of the published catalogue. */
const FEED_PAGE_SIZE = 200;

export type FeedLesson = Pick<
  LessonWithRelations,
  | 'id'
  | 'title'
  | 'hebrew_title'
  | 'description'
  | 'summary'
  | 'date'
  | 'hebrew_date'
  | 'parsha'
  | 'duration'
  | 'audio_url'
  | 'file_size'
  | 'series'
  | 'audio_files'
>;

const FEED_LESSON_COLUMNS = `id, title, hebrew_title, description, summary, date, hebrew_date, parsha, duration, audio_url, file_size, series(id, name, hebrew_name), ${LESSON_AUDIO_FILES}`;

export interface FeedChannel {
  title: string;
  description: string;
  /** Absolute URL of the page the feed belongs to. */
  link: string;
  /** Absolute URL of the feed itself. */
  feedUrl: string;
}

/**
 * Published lessons for a feed, newest first. The site feed leaves out short
 * clips (lesson_type short_clip, or filed under קצרים and its topics); a
 * series feed lists everything in the series.
 */
export async function loadFeedLessons(
  supabase: SupabaseClient,
  options: { seriesId?: string } = {},
): Promise<FeedLesson[]> {
  let shortCategoryIds: string[] | null = null;
  if (!options.seriesId) {
    const { data: topics, error: topicsError } = await supabase
      .from('categories')
      .select('id')
      .eq('parent_id', SHORTS_CATEGORY_ID);
    if (topicsError) throw topicsError;
    shortCategoryIds = [SHORTS_CATEGORY_ID, ...(topics ?? []).map((topic) => topic.id as string)];
  }

  const lessons: FeedLesson[] = [];
  for (let offset = 0; ; offset += FEED_PAGE_SIZE) {
    let query = supabase.from('lessons').select(FEED_LESSON_COLUMNS).eq('is_published', true);
    if (options.seriesId) {
      query = query.eq('series_id', options.seriesId);
    } else if (shortCategoryIds) {
      query = query
        .or(`lesson_type.is.null,lesson_type.neq.${SHORT_LESSON_TYPE}`)
        .or(`category_id.is.null,category_id.not.in.(${shortCategoryIds.join(',')})`);
    }

    const { data, error } = await query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + FEED_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as FeedLesson[];
    lessons.push(...page);
    if (page.length < FEED_PAGE_SIZE) break;
  }
  return lessons;
}

const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Escapes text for XML element content and attribute values, dropping characters XML 1.0 forbids. */
export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderItems(lessons: readonly FeedLesson[]): string[] {
  return lessons.flatMap((lesson) => {
    const title = lesson.hebrew_title || lesson.title;
    const description = lessonDescription(lesson);
    const link = lessonUrl(lesson.id);
    // Lesson day (UTC midnight); each part a minute later so apps keep part order.
    const day = Date.parse(`${lesson.date}T00:00:00Z`);
    const audioFiles = lesson.audio_files ?? [];
    let parts: EpisodeAudio[];
    if (audioFiles.length > 0) {
      parts = lessonEpisodeAudio(audioFiles);
    } else {
      const audioUrl = normalizeAudioUrl(lesson.audio_url);
      const directUrl = audioUrl && getAudioDirectUrl(audioUrl);
      parts = directUrl
        ? [{
            id: lesson.id,
            url: absoluteUrl(directUrl),
            contentType: getAudioContentType(audioUrl),
            fileSize: lesson.file_size || 0,
            duration: lesson.duration || 0,
            partNumber: 1,
            partCount: 1,
            label: null,
          }]
        : [];
    }
    return parts.map((part) => {
      const partTitle =
        part.partCount > 1
          ? `${title} · חלק ${part.partNumber}${part.label ? ` (${part.label})` : ''}`
          : title;
      const pubDate = Number.isNaN(day) ? null : new Date(day + (part.partNumber - 1) * 60_000).toUTCString();
      return [
        '<item>',
        `<title>${escapeXml(partTitle)}</title>`,
        `<description>${escapeXml(description)}</description>`,
        `<link>${escapeXml(link)}</link>`,
        `<guid isPermaLink="false">${escapeXml(part.id)}</guid>`,
        pubDate ? `<pubDate>${pubDate}</pubDate>` : '',
        `<enclosure url="${escapeXml(part.url)}" length="${part.fileSize}" type="${escapeXml(part.contentType)}"/>`,
        part.duration > 0 ? `<itunes:duration>${Math.round(part.duration)}</itunes:duration>` : '',
        '<itunes:episodeType>full</itunes:episodeType>',
        '<itunes:explicit>false</itunes:explicit>',
        '</item>',
      ]
        .filter(Boolean)
        .join('');
    });
  });
}

export function buildPodcastFeed(channel: FeedChannel, lessons: readonly FeedLesson[]): string {
  const image = absoluteUrl(PODCAST_COVER_PATH);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(channel.link)}</link>`,
    `<atom:link href="${escapeXml(channel.feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml(channel.description)}</description>`,
    '<language>he</language>',
    `<itunes:author>${escapeXml(SITE_AUTHOR)}</itunes:author>`,
    `<itunes:image href="${escapeXml(image)}"/>`,
    `<image><url>${escapeXml(image)}</url><title>${escapeXml(channel.title)}</title><link>${escapeXml(channel.link)}</link></image>`,
    '<itunes:category text="Religion &amp; Spirituality"><itunes:category text="Judaism"/></itunes:category>',
    '<itunes:explicit>false</itunes:explicit>',
    '<itunes:type>episodic</itunes:type>',
    ...renderItems(lessons),
    '</channel>',
    '</rss>',
  ].join('\n');
}
