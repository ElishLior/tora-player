import type { SupabaseClient } from '@supabase/supabase-js';
import { getLessonTracks } from '@/lib/lesson-tracks';
import { LESSON_AUDIO_FILES, LESSON_CARD_COLUMNS } from '@/lib/supabase/lesson-selects';
import { withLessonSlugSelect } from '@/lib/supabase/lesson-slug-select';
import { newQueueSessionId, type CategoryQueueSource, type QueueCursor, type SegmentPage } from '@/lib/queue-source';
import type { AudioTrack } from '@/stores/audio-store';
import type { Category, LessonWithRelations } from '@/types/database';

/*
 * Category playback: which lessons a category queue holds (scope, order), how
 * the catalog is read one keyset segment at a time, and the request validation
 * the server action applies to what the browser sends.
 */

export const CATEGORY_SEGMENT_SIZE = 25;
export const MAX_SEGMENT_LIMIT = 50;
const MAX_SCOPE_IDS = 200;

/**
 * The category and every descendant, at any depth (cycle-safe), from flat rows.
 * Pages that already hold the category tree use `descendantIds` (category-tree.ts).
 */
export function scopeCategoryIds(categories: Pick<Category, 'id' | 'parent_id'>[], categoryId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parent_id) continue;
    childrenOf.set(category.parent_id, [...(childrenOf.get(category.parent_id) ?? []), category.id]);
  }
  const scope: string[] = [];
  const seen = new Set<string>();
  const stack = [categoryId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    scope.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return scope;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The category list order as a comparator: negative when `a` plays first.
 * Date, then created_at, then id, all descending. Timestamps compare as text,
 * which is the order PostgreSQL uses for the stored format.
 */
export function compareQueueOrder(a: QueueCursor, b: QueueCursor): number {
  return compareText(b.date, a.date) || compareText(b.createdAt, a.createdAt) || compareText(b.id, a.id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The PostgREST `or` filter for rows strictly after the cursor in list order.
 * Every value is validated before it reaches this function (parseCursor); the
 * timestamp is quoted so its colons and offset stay inside one value.
 */
export function keysetFilter(cursor: QueueCursor): string {
  const { date, createdAt, id } = cursor;
  return [
    `date.lt.${date}`,
    `and(date.eq.${date},created_at.lt."${createdAt}")`,
    `and(date.eq.${date},created_at.eq."${createdAt}",id.lt.${id})`,
  ].join(',');
}

function parseCursor(raw: unknown): QueueCursor | null {
  if (!raw || typeof raw !== 'object') return null;
  const { date, createdAt, id } = raw as Record<string, unknown>;
  if (typeof date !== 'string' || !DATE.test(date)) return null;
  if (typeof createdAt !== 'string' || !TIMESTAMP.test(createdAt)) return null;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  return { date, createdAt, id };
}

export interface CategorySegmentRequest {
  scopeIds: string[];
  cursor: QueueCursor | null;
  snapshotAt: string;
  limit: number;
}

/** Validates what the browser sent. Null for anything malformed; a limit above the maximum is clamped. */
export function parseCategorySegmentRequest(raw: unknown): CategorySegmentRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;

  const scopeIds = input.scopeIds;
  if (
    !Array.isArray(scopeIds) ||
    scopeIds.length === 0 ||
    scopeIds.length > MAX_SCOPE_IDS ||
    !scopeIds.every((id) => typeof id === 'string' && UUID.test(id))
  ) {
    return null;
  }

  if (typeof input.snapshotAt !== 'string' || !TIMESTAMP.test(input.snapshotAt)) return null;

  let cursor: QueueCursor | null = null;
  if (input.cursor !== null && input.cursor !== undefined) {
    cursor = parseCursor(input.cursor);
    if (!cursor) return null;
  }

  const limit = input.limit === undefined ? CATEGORY_SEGMENT_SIZE : input.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) return null;

  return {
    scopeIds: scopeIds as string[],
    cursor,
    snapshotAt: input.snapshotAt,
    limit: Math.min(limit, MAX_SEGMENT_LIMIT),
  };
}

const SEGMENT_SELECT = `${LESSON_CARD_COLUMNS}, series(id, name, hebrew_name), category:categories(id, hebrew_name), ${LESSON_AUDIO_FILES}`;

export interface CategorySegment {
  /** Published lessons in list order, after the cursor, at most `limit`. */
  lessons: LessonWithRelations[];
  /** The last lesson returned (not the last one with audio). Null when none. */
  cursor: QueueCursor | null;
  exhausted: boolean;
}

/**
 * One keyset page of a category's published lessons. Pass the anon catalog
 * client: RLS limits it to published lessons. Throws on a failed read.
 */
export async function loadCategoryQueueSegment(
  client: SupabaseClient,
  request: CategorySegmentRequest,
): Promise<CategorySegment> {
  const { limit } = request;
  const result = await withLessonSlugSelect(SEGMENT_SELECT, (columns) => {
    const base = client
      .from('lessons')
      .select(columns)
      .eq('is_published', true)
      .in('category_id', request.scopeIds)
      .lte('created_at', request.snapshotAt)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    const filtered = request.cursor ? base.or(keysetFilter(request.cursor)) : base;
    return filtered.overrideTypes<LessonWithRelations[], { merge: false }>();
  });
  if (result.error) throw result.error;

  const rows = (result.data ?? []) as LessonWithRelations[];
  const lessons = rows.slice(0, limit);
  const last = lessons[lessons.length - 1];
  return {
    lessons,
    cursor: last ? { date: last.date, createdAt: last.created_at, id: last.id } : request.cursor,
    exhausted: rows.length <= limit,
  };
}

/** Playable tracks of a segment, in list order, one track per part. */
export function segmentToTracks(lessons: LessonWithRelations[]): AudioTrack[] {
  return lessons.flatMap((lesson) => getLessonTracks(lesson));
}

export function segmentToPage(segment: CategorySegment): SegmentPage {
  return {
    tracks: segmentToTracks(segment.lessons),
    cursor: segment.cursor,
    exhausted: segment.exhausted,
  };
}

/** A new category queue source for a play session that starts from a first segment. */
export function createCategoryQueueSource(input: {
  categoryId: string;
  scopeIds: string[];
  snapshotAt: string;
  cursor: QueueCursor | null;
  exhausted: boolean;
  sessionId?: string;
}): CategoryQueueSource {
  return {
    kind: 'category',
    categoryId: input.categoryId,
    scopeIds: input.scopeIds,
    order: 'list',
    cursor: input.cursor,
    exhausted: input.exhausted,
    sessionId: input.sessionId ?? newQueueSessionId(),
    snapshotAt: input.snapshotAt,
  };
}

/** The request a source needs for its next segment. */
export function nextSegmentRequest(source: CategoryQueueSource): CategorySegmentRequest {
  return {
    scopeIds: source.scopeIds,
    cursor: source.cursor,
    snapshotAt: source.snapshotAt,
    limit: CATEGORY_SEGMENT_SIZE,
  };
}
