import type { Metadata } from 'next';
import {
  FEED_PATH,
  SITE_AUTHOR,
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
  lessonPath,
  pageUrl,
  seriesPath,
} from '@/config/site';
import { getAudioContentType, getAudioDirectUrl } from '@/lib/audio-download';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { formatDuration } from '@/lib/utils';
import type { LessonAudio, LessonWithRelations, Series } from '@/types/database';

/** Search and link previews cut descriptions around this length. */
export const DESCRIPTION_MAX_LENGTH = 160;

/** Metadata for personal, admin and device-only sections (their `layout.tsx` exports it). */
export const NOINDEX_METADATA: Metadata = { robots: { index: false, follow: false } };

/** Collapses whitespace and cuts at a word boundary, ending with an ellipsis when shortened. */
export function truncateText(text: string, max = DESCRIPTION_MAX_LENGTH): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** ISO-8601 duration for schema.org, e.g. 6905 → `PT1H55M5S`. */
export function isoDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (total === 0) return 'PT0S';
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${secs ? `${secs}S` : ''}`;
}

/**
 * `alternates` for an indexable content page: canonical on the default-locale
 * URL (other locales are noindex duplicates, see [locale]/layout.tsx) plus the
 * podcast feed links (`feeds` first, then the site feed). A page's
 * `alternates` replaces the root one entirely, so pages must use this to keep
 * the RSS link.
 */
export function pageAlternates(
  pathname: string,
  feeds: ReadonlyArray<{ url: string; title: string }> = [],
): Metadata['alternates'] {
  return {
    canonical: pageUrl(pathname),
    types: { 'application/rss+xml': [...feeds, { url: FEED_PATH, title: SITE_NAME.he }] },
  };
}

type DescribedLesson = Pick<
  LessonWithRelations,
  'description' | 'summary' | 'hebrew_date' | 'date' | 'parsha' | 'duration' | 'series'
>;

/** The lesson's own description, else a line of its facts (date, parsha, series, length) and the site tagline. */
export function lessonDescription(lesson: DescribedLesson): string {
  const own = lesson.description || lesson.summary;
  if (own?.trim()) return truncateText(own);
  const facts = [
    lesson.hebrew_date || lesson.date,
    lesson.parsha,
    lesson.series?.hebrew_name || lesson.series?.name,
    lesson.duration > 0 ? formatDuration(lesson.duration) : null,
  ].filter(Boolean);
  return truncateText([facts.join(' · '), SITE_TAGLINE.he].filter(Boolean).join(' — '));
}

export interface EpisodeAudio {
  /** lesson_audio id: stable feed GUID. */
  id: string;
  /** Absolute same-origin URL that redirects to the raw audio (supports Range via R2). */
  url: string;
  contentType: string;
  fileSize: number;
  duration: number;
  partNumber: number;
  partCount: number;
  /** Admin display name or audio type ("עץ חיים"), when set. */
  label: string | null;
}

/**
 * A lesson's audio parts as public, absolute enclosure URLs, in play order
 * (sort_order, then id — the same order as getLessonTracks). Files not stored
 * in R2 (external imports) have no stable public URL and are left out.
 */
export function lessonEpisodeAudio(
  audioFiles: ReadonlyArray<
    Pick<LessonAudio, 'id' | 'file_key' | 'audio_url' | 'file_size' | 'duration' | 'sort_order' | 'original_name' | 'audio_type'>
  >,
): EpisodeAudio[] {
  const sorted = [...audioFiles].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  return sorted.flatMap((file, index) => {
    const direct = getAudioDirectUrl(normalizeAudioUrl(file.audio_url) ?? '');
    if (!direct) return [];
    return [
      {
        id: file.id,
        url: absoluteUrl(direct),
        contentType: getAudioContentType(file.file_key),
        fileSize: file.file_size || 0,
        duration: file.duration || 0,
        partNumber: index + 1,
        partCount: sorted.length,
        label: file.original_name || file.audio_type || null,
      },
    ];
  });
}

/** JSON for a `<script type="application/ld+json">`; `<` is escaped so text can never close the script. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; pathname: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: pageUrl(item.pathname),
    })),
  };
}

function podcastSeriesRef(series: Pick<Series, 'id' | 'name' | 'hebrew_name'> | null | undefined) {
  return series
    ? { '@type': 'PodcastSeries', name: series.hebrew_name || series.name, url: pageUrl(seriesPath(series.id)) }
    : { '@type': 'PodcastSeries', name: SITE_NAME.he, url: pageUrl('/'), webFeed: absoluteUrl(FEED_PATH) };
}

export function lessonJsonLd(lesson: LessonWithRelations) {
  const url = pageUrl(lessonPath(lesson.id));
  const audio = lessonEpisodeAudio(lesson.audio_files ?? []);
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    '@id': url,
    url,
    name: lesson.hebrew_title || lesson.title,
    description: lessonDescription(lesson),
    datePublished: lesson.date,
    inLanguage: 'he',
    ...(lesson.duration > 0 && { timeRequired: isoDuration(lesson.duration) }),
    author: { '@type': 'Person', name: lesson.teacher || SITE_AUTHOR },
    partOfSeries: podcastSeriesRef(lesson.series),
    ...(lesson.tags?.length > 0 && { keywords: lesson.tags.join(', ') }),
    ...(audio.length > 0 && {
      associatedMedia: audio.map((part) => ({
        '@type': 'AudioObject',
        contentUrl: part.url,
        encodingFormat: part.contentType,
        ...(part.duration > 0 && { duration: isoDuration(part.duration) }),
        ...(part.fileSize > 0 && { contentSize: String(part.fileSize) }),
        ...(part.partCount > 1 && { name: part.label ? `חלק ${part.partNumber} · ${part.label}` : `חלק ${part.partNumber}` }),
      })),
    }),
  };
}

export function seriesJsonLd(series: Series, feedPath: string) {
  const url = pageUrl(seriesPath(series.id));
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastSeries',
    '@id': url,
    url,
    name: series.hebrew_name || series.name,
    ...(series.description?.trim() ? { description: truncateText(series.description) } : {}),
    inLanguage: 'he',
    author: { '@type': 'Person', name: SITE_AUTHOR },
    webFeed: absoluteUrl(feedPath),
  };
}
