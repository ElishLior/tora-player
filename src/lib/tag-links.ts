/** URL helpers for tag pages and lesson filters. Tags are stored normalized (src/lib/tags.ts). */
import { normalizeTag } from '@/lib/tags';

/** Locale-less path of a tag page (pass to the i18n `Link`). */
export function tagPath(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}`;
}

/**
 * Tag from a `/tags/[tag]` route segment. Next may hand the segment over still
 * percent-encoded (non-ASCII) or already decoded, so decode leniently.
 */
export function tagFromSegment(segment: string): string | null {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Already decoded and contains a literal '%'.
  }
  return normalizeTag(decoded);
}

/** Tag from a `?tag=` search param (first value wins); invalid input means no filter. */
export function tagFromSearchParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw && normalizeTag(raw)) || undefined;
}

export interface LessonsListQuery {
  q?: string;
  type?: string;
  cat?: string;
  tag?: string;
  date?: string;
}

/**
 * A Postgres DATE: exact YYYY-MM-DD, a real Gregorian day from 1000 on (the Hebrew date
 * formatter reads two-digit years as 19xx), no time-zone conversion. First value wins.
 */
export function dateFromSearchParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const [year, month, day] = raw.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return undefined;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1] ? raw : undefined;
}

/** `/lessons` href keeping every active filter; empty values are dropped. */
export function lessonsHref(query: LessonsListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.type) params.set('type', query.type);
  if (query.cat) params.set('cat', query.cat);
  if (query.tag) params.set('tag', query.tag);
  const date = dateFromSearchParam(query.date);
  if (date) params.set('date', date);
  const search = params.toString();
  return search ? `/lessons?${search}` : '/lessons';
}

export interface TagCount {
  tag: string;
  lesson_count: number;
}

/** Tags whose text contains the query (case-insensitive, '#' optional), most used first. */
export function matchTags(tags: readonly TagCount[], query: string): string[] {
  const needle = normalizeTag(query)?.toLocaleLowerCase();
  if (!needle) return [];
  return tags.filter(({ tag }) => tag.toLocaleLowerCase().includes(needle)).map(({ tag }) => tag);
}

/** Cloud size step 0–4, logarithmic so one very common tag does not flatten the rest. */
export function tagWeight(count: number, maxCount: number): number {
  if (maxCount <= 1 || count <= 1) return 0;
  return Math.min(4, Math.round((Math.log(count) / Math.log(maxCount)) * 4));
}
