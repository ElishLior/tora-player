import type { AudioTrack } from '@/stores/audio-store';

/*
 * Where the player's queue came from, so a long session (a whole category,
 * hours of lessons) keeps loading its next lessons in the same order and
 * without reshuffling. Pure rules: the store keeps the source, the controller
 * drives loading and advancing, category-queue.ts reads the catalog.
 */

/** Position of the last lesson loaded, in the category list order (date, created_at, id; all descending). */
export interface QueueCursor {
  date: string;
  /** The stored timestamp as the database returned it (microseconds kept). */
  createdAt: string;
  id: string;
}

export interface CategoryQueueSource {
  kind: 'category';
  categoryId: string;
  /** The category and all its descendants. Lessons have one category, so none appears twice. */
  scopeIds: string[];
  /** The order the category page lists lessons in. */
  order: 'list';
  /** The last lesson loaded; the next segment starts after it. Null before any lesson. */
  cursor: QueueCursor | null;
  /** No lessons are left after the cursor. */
  exhausted: boolean;
  /** Identifies one play session; a segment for an older session is dropped. */
  sessionId: string;
  /** Only lessons created at or before this instant belong to the session. */
  snapshotAt: string;
}

export type QueueSource = CategoryQueueSource;

/** A message the player shows for a queue; cleared when a new queue starts or playback is resumed. */
export type QueueNotice =
  | { kind: 'loading' }
  | { kind: 'skipped'; title: string }
  | { kind: 'finished' }
  | { kind: 'stopped' };

/** Start loading the next segment when this many lessons (or fewer) remain, the current one included. */
export const SEGMENT_AHEAD_LESSONS = 2;
/** Consecutive unavailable lessons tolerated before the queue stops. */
export const MAX_CONSECUTIVE_SKIPS = 3;
/** Segments that hold no playable audio tolerated while waiting for the next lesson. */
export const MAX_EMPTY_SEGMENT_ROUNDS = 5;

/** One page read after the cursor, as the queue receives it. */
export interface SegmentPage {
  tracks: AudioTrack[];
  cursor: QueueCursor | null;
  exhausted: boolean;
}

export type SegmentOutcome = 'appended' | 'exhausted' | 'stale' | 'failed';

export function cursorKey(cursor: QueueCursor | null): string {
  return cursor ? `${cursor.date}|${cursor.createdAt}|${cursor.id}` : 'start';
}

function lessonIdOf(track: AudioTrack): string {
  return track.lessonId || track.id;
}

/** Distinct lessons from `index` to the end of the queue (the current lesson included). */
export function remainingLessonCount(queue: readonly AudioTrack[], index: number): number {
  return new Set(queue.slice(Math.max(0, index)).map(lessonIdOf)).size;
}

export function shouldLoadAhead(source: QueueSource | null, remainingLessons: number): boolean {
  return !!source && !source.exhausted && remainingLessons <= SEGMENT_AHEAD_LESSONS;
}

/**
 * Appends tracks whose lesson is not queued yet. All parts of a new lesson are
 * kept together and in order; a lesson already in the queue is skipped whole.
 */
export function appendUniqueTracks(queue: readonly AudioTrack[], incoming: readonly AudioTrack[]): AudioTrack[] {
  const queued = new Set(queue.map(lessonIdOf));
  return [...queue, ...incoming.filter((track) => !queued.has(lessonIdOf(track)))];
}

/**
 * A failure that will not go away by retrying: decode errors (3) and sources
 * the element rejects (4), which is what a 404 or 403 stream reports. Network
 * errors (2) and every failure while offline are temporary.
 */
export function isPermanentMediaError(code: number | undefined, online: boolean): boolean {
  if (!online) return false;
  return code === 3 || code === 4;
}

export function newQueueSessionId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  return id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export interface SegmentLoaderDeps {
  getSource: () => QueueSource | null;
  /** Reads the page after `source.cursor`. Null when the read failed. */
  fetchPage: (source: QueueSource) => Promise<SegmentPage | null>;
  /** Adds the page when its session is still the current queue. False when dropped. */
  append: (sessionId: string, page: SegmentPage) => boolean;
}

export interface SegmentLoader {
  /** Starts a load when the queue is close to its end. Never throws. */
  ensureAhead(remainingLessons: number): void;
  /** Loads the next page now (the queue ran out). Shares a load already in flight for the same cursor. */
  loadNext(): Promise<SegmentOutcome>;
}

/**
 * Loads the category's next segment at most once per cursor: a load in flight
 * for the same session and cursor is reused, and a successful append moves the
 * cursor, so the same page is never requested twice.
 */
export function createSegmentLoader(deps: SegmentLoaderDeps): SegmentLoader {
  let inFlight: { key: string; promise: Promise<SegmentOutcome> } | null = null;

  async function run(source: QueueSource): Promise<SegmentOutcome> {
    try {
      const page = await deps.fetchPage(source);
      if (!page) return 'failed';
      if (!deps.append(source.sessionId, page)) return 'stale';
      return page.exhausted ? 'exhausted' : 'appended';
    } catch {
      return 'failed';
    }
  }

  function loadNext(): Promise<SegmentOutcome> {
    const source = deps.getSource();
    if (!source) return Promise.resolve('stale');
    if (source.exhausted) return Promise.resolve('exhausted');
    const key = `${source.sessionId}|${cursorKey(source.cursor)}`;
    if (inFlight?.key === key) return inFlight.promise;
    const promise = run(source).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { key, promise };
    return promise;
  }

  return {
    ensureAhead(remainingLessons) {
      if (shouldLoadAhead(deps.getSource(), remainingLessons)) void loadNext();
    },
    loadNext,
  };
}
