import { describe, expect, it, vi } from 'vitest';
import {
  appendUniqueTracks,
  createSegmentLoader,
  cursorKey,
  isPermanentMediaError,
  remainingLessonCount,
  shouldLoadAhead,
  type CategoryQueueSource,
  type QueueCursor,
  type SegmentPage,
} from './queue-source';
import type { AudioTrack } from '@/stores/audio-store';

function track(lessonId: string, part = 0, parts = 1): AudioTrack {
  return {
    id: lessonId,
    lessonId,
    audioFileId: `${lessonId}-${part}`,
    partIndex: part,
    partCount: parts,
    title: lessonId,
    hebrewTitle: lessonId,
    audioUrl: `/api/audio/stream/${lessonId}-${part}.mp3`,
    duration: 60,
    date: '2026-01-01',
  };
}

function source(overrides: Partial<CategoryQueueSource> = {}): CategoryQueueSource {
  return {
    kind: 'category',
    categoryId: 'cat',
    scopeIds: ['cat'],
    order: 'list',
    cursor: null,
    exhausted: false,
    sessionId: 's1',
    snapshotAt: '2026-10-13T00:00:00.000000+00:00',
    ...overrides,
  };
}

const CURSOR_A: QueueCursor = {
  date: '2026-10-01',
  createdAt: '2026-10-01T10:00:00.000001+00:00',
  id: '00000000-0000-4000-8000-00000000000a',
};

describe('remainingLessonCount', () => {
  it('counts distinct lessons from the current track to the end, parts once', () => {
    const queue = [track('a', 0, 2), track('a', 1, 2), track('b'), track('c')];
    expect(remainingLessonCount(queue, 0)).toBe(3);
    expect(remainingLessonCount(queue, 1)).toBe(3);
    expect(remainingLessonCount(queue, 2)).toBe(2);
    expect(remainingLessonCount(queue, 3)).toBe(1);
  });

  it('counts the whole queue when no track is current yet', () => {
    expect(remainingLessonCount([track('a'), track('b')], -1)).toBe(2);
  });
});

describe('shouldLoadAhead', () => {
  it('asks for the next segment within the last two lessons of an open category queue', () => {
    expect(shouldLoadAhead(source(), 2)).toBe(true);
    expect(shouldLoadAhead(source(), 1)).toBe(true);
    expect(shouldLoadAhead(source(), 3)).toBe(false);
  });

  it('never asks once the category is exhausted, or for a plain queue', () => {
    expect(shouldLoadAhead(source({ exhausted: true }), 1)).toBe(false);
    expect(shouldLoadAhead(null, 1)).toBe(false);
  });
});

describe('appendUniqueTracks', () => {
  it('adds a new lesson with all its parts, in order', () => {
    const queue = [track('a')];
    const next = appendUniqueTracks(queue, [track('b', 0, 2), track('b', 1, 2)]);
    expect(next.map((t) => `${t.lessonId}:${t.partIndex}`)).toEqual(['a:0', 'b:0', 'b:1']);
  });

  it('never duplicates a lesson that is already queued, whole', () => {
    const queue = [track('a'), track('b', 0, 2), track('b', 1, 2)];
    const next = appendUniqueTracks(queue, [track('b', 0, 2), track('b', 1, 2), track('c')]);
    expect(next.map((t) => t.lessonId)).toEqual(['a', 'b', 'b', 'c']);
  });

  it('returns a new array and leaves the queue it was given untouched', () => {
    const queue = [track('a')];
    const next = appendUniqueTracks(queue, [track('b')]);
    expect(queue).toHaveLength(1);
    expect(next).not.toBe(queue);
  });
});

describe('isPermanentMediaError', () => {
  it('treats decode and unsupported-source errors as permanent while online', () => {
    expect(isPermanentMediaError(3, true)).toBe(true);
    expect(isPermanentMediaError(4, true)).toBe(true);
  });

  it('treats network errors, aborts and anything offline as temporary', () => {
    expect(isPermanentMediaError(2, true)).toBe(false);
    expect(isPermanentMediaError(1, true)).toBe(false);
    expect(isPermanentMediaError(undefined, true)).toBe(false);
    expect(isPermanentMediaError(4, false)).toBe(false);
  });
});

describe('cursorKey', () => {
  it('identifies a cursor by its three fields and the start by a fixed word', () => {
    expect(cursorKey(null)).toBe('start');
    expect(cursorKey(CURSOR_A)).toBe(`${CURSOR_A.date}|${CURSOR_A.createdAt}|${CURSOR_A.id}`);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('createSegmentLoader', () => {
  function setup(initial: CategoryQueueSource) {
    let current: CategoryQueueSource | null = initial;
    const fetchPage = vi.fn<(source: CategoryQueueSource) => Promise<SegmentPage | null>>(async () => null);
    const append = vi.fn((sessionId: string, page: SegmentPage) => {
      if (!current || current.sessionId !== sessionId) return false;
      current = { ...current, cursor: page.cursor ?? current.cursor, exhausted: page.exhausted };
      return true;
    });
    const loader = createSegmentLoader({ getSource: () => current, fetchPage, append });
    return {
      loader,
      fetchPage,
      append,
      current: () => current,
      drop: () => {
        current = null;
      },
      replaceSession: (sessionId: string) => {
        current = current && { ...current, sessionId };
      },
    };
  }

  it('loads the next page once while one is in flight for the same cursor', async () => {
    const page = deferred<SegmentPage | null>();
    const t = setup(source());
    t.fetchPage.mockReturnValueOnce(page.promise);

    t.loader.ensureAhead(1);
    t.loader.ensureAhead(1);
    const second = t.loader.loadNext();
    page.resolve({ tracks: [track('b')], cursor: CURSOR_A, exhausted: false });

    await expect(second).resolves.toBe('appended');
    expect(t.fetchPage).toHaveBeenCalledTimes(1);
    expect(t.append).toHaveBeenCalledTimes(1);
  });

  it('moves the cursor forward with each appended page, so the next read starts after it', async () => {
    const t = setup(source());
    t.fetchPage.mockResolvedValueOnce({ tracks: [track('b')], cursor: CURSOR_A, exhausted: false });
    t.fetchPage.mockResolvedValueOnce({ tracks: [track('c')], cursor: null, exhausted: true });

    await expect(t.loader.loadNext()).resolves.toBe('appended');
    expect(t.current()?.cursor).toEqual(CURSOR_A);
    await expect(t.loader.loadNext()).resolves.toBe('exhausted');
    expect(t.fetchPage).toHaveBeenCalledTimes(2);
    expect(t.fetchPage.mock.calls[1][0].cursor).toEqual(CURSOR_A);
  });

  it('requests nothing once the category is exhausted', async () => {
    const t = setup(source({ exhausted: true }));

    t.loader.ensureAhead(1);

    await expect(t.loader.loadNext()).resolves.toBe('exhausted');
    expect(t.fetchPage).not.toHaveBeenCalled();
  });

  it('does nothing while the queue is far from its end', () => {
    const t = setup(source());

    t.loader.ensureAhead(5);

    expect(t.fetchPage).not.toHaveBeenCalled();
  });

  it('drops a page that belongs to a session that is no longer current', async () => {
    const page = deferred<SegmentPage | null>();
    const t = setup(source());
    t.fetchPage.mockReturnValueOnce(page.promise);
    const pending = t.loader.loadNext();

    t.replaceSession('s2');
    page.resolve({ tracks: [track('b')], cursor: CURSOR_A, exhausted: false });

    await expect(pending).resolves.toBe('stale');
    expect(t.current()?.cursor).toBeNull();
  });

  it('reports a failed read and leaves the cursor where it was, so a later attempt can retry', async () => {
    const t = setup(source());
    t.fetchPage.mockResolvedValueOnce(null);
    t.fetchPage.mockResolvedValueOnce({ tracks: [track('b')], cursor: CURSOR_A, exhausted: false });

    await expect(t.loader.loadNext()).resolves.toBe('failed');
    await expect(t.loader.loadNext()).resolves.toBe('appended');
  });

  it('turns a thrown read into a failure rather than an unhandled rejection', async () => {
    const t = setup(source());
    t.fetchPage.mockRejectedValueOnce(new Error('network'));

    await expect(t.loader.loadNext()).resolves.toBe('failed');
  });

  it('reports stale when the queue was dropped while loading', async () => {
    const t = setup(source());
    t.drop();

    await expect(t.loader.loadNext()).resolves.toBe('stale');
    expect(t.fetchPage).not.toHaveBeenCalled();
  });
});
