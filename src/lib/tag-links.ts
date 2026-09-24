/** URL helpers for tag pages and the `?tag=` lesson filter. Tags are stored normalized (src/lib/tags.ts). */
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
}

/** `/lessons` href keeping every active filter; empty values are dropped. */
export function lessonsHref(query: LessonsListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.type) params.set('type', query.type);
  if (query.cat) params.set('cat', query.cat);
  if (query.tag) params.set('tag', query.tag);
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
