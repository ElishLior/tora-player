import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CATEGORY_LIST_LIMIT,
  CATEGORY_SEGMENT_SIZE,
  compareQueueOrder,
  createCategoryQueueSource,
  keysetFilter,
  loadCategoryQueueSegment,
  MAX_SEGMENT_LIMIT,
  nextSegmentRequest,
  parseCategorySegmentRequest,
  scopeCategoryIds,
  seedFromCategoryRows,
  segmentToPage,
  segmentToTracks,
  type CategorySegmentRequest,
} from './category-queue';
import type { QueueCursor } from './queue-source';
import type { Category, LessonWithRelations } from '@/types/database';

const SNAPSHOT = '2026-10-13T12:00:00.000000+00:00';
const UUID_A = '00000000-0000-4000-8000-00000000000a';
const UUID_B = '00000000-0000-4000-8000-00000000000b';
const UUID_C = '00000000-0000-4000-8000-00000000000c';

function category(id: string, parent: string | null): Pick<Category, 'id' | 'parent_id'> {
  return { id, parent_id: parent };
}

describe('scopeCategoryIds', () => {
  const tree = [
    category('root', null),
    category('child', 'root'),
    category('grandchild', 'child'),
    category('great', 'grandchild'),
    category('sibling', 'root'),
    category('other-root', null),
    category('other-child', 'other-root'),
  ];

  it('returns the category and every descendant, at any depth', () => {
    expect(scopeCategoryIds(tree, 'root').sort()).toEqual(['root', 'child', 'grandchild', 'great', 'sibling'].sort());
  });

  it('returns only the branch below a middle category', () => {
    expect(scopeCategoryIds(tree, 'child').sort()).toEqual(['child', 'grandchild', 'great'].sort());
  });

  it('returns the category alone when it has no children, and itself for an unknown id', () => {
    expect(scopeCategoryIds(tree, 'great')).toEqual(['great']);
    expect(scopeCategoryIds(tree, 'missing')).toEqual(['missing']);
  });

  it('terminates on a cycle in the stored parents and lists each id once', () => {
    const cyclic = [category('a', 'b'), category('b', 'a')];
    expect(scopeCategoryIds(cyclic, 'a').sort()).toEqual(['a', 'b']);
  });
});

function lesson(id: string, date: string, createdAt: string): QueueCursor {
  return { id, date, createdAt };
}

describe('compareQueueOrder', () => {
  it('lists newer dates first', () => {
    const newer = lesson('1', '2026-10-12', '2026-10-12T09:00:00.000000+00:00');
    const older = lesson('2', '2026-10-11', '2026-10-11T23:00:00.000000+00:00');
    expect(compareQueueOrder(newer, older)).toBeLessThan(0);
    expect(compareQueueOrder(older, newer)).toBeGreaterThan(0);
  });

  it('breaks a same-date tie by created_at, newest first', () => {
    const later = lesson(UUID_A, '2026-10-12', '2026-10-12T18:00:00.000001+00:00');
    const earlier = lesson(UUID_B, '2026-10-12', '2026-10-12T18:00:00.000000+00:00');
    expect(compareQueueOrder(later, earlier)).toBeLessThan(0);
  });

  it('breaks a same-timestamp tie by id, descending', () => {
    const createdAt = '2026-10-12T18:00:00.000000+00:00';
    const high = lesson(UUID_C, '2026-10-12', createdAt);
    const low = lesson(UUID_A, '2026-10-12', createdAt);
    expect(compareQueueOrder(high, low)).toBeLessThan(0);
    expect(compareQueueOrder(low, low)).toBe(0);
  });

  it('sorts a mixed list into one stable order', () => {
    const rows = [
      lesson(UUID_A, '2026-10-11', '2026-10-11T10:00:00.000000+00:00'),
      lesson(UUID_B, '2026-10-12', '2026-10-12T10:00:00.000000+00:00'),
      lesson(UUID_C, '2026-10-12', '2026-10-12T10:00:00.000000+00:00'),
    ];
    const sorted = [...rows].sort(compareQueueOrder).map((row) => row.id);
    expect(sorted).toEqual([UUID_C, UUID_B, UUID_A]);
  });
});

/** Rows strictly after the cursor, as the keyset filter's three clauses describe them. */
function matchesKeyset(row: QueueCursor, cursor: QueueCursor): boolean {
  return (
    row.date < cursor.date ||
    (row.date === cursor.date && row.createdAt < cursor.createdAt) ||
    (row.date === cursor.date && row.createdAt === cursor.createdAt && row.id < cursor.id)
  );
}

describe('keysetFilter', () => {
  const cursor: QueueCursor = {
    date: '2026-10-12',
    createdAt: '2026-10-12T18:00:00.123456+00:00',
    id: UUID_A,
  };

  it('builds the three-clause or filter with the timestamp quoted', () => {
    expect(keysetFilter(cursor)).toBe(
      `date.lt.2026-10-12,and(date.eq.2026-10-12,created_at.lt."2026-10-12T18:00:00.123456+00:00"),and(date.eq.2026-10-12,created_at.eq."2026-10-12T18:00:00.123456+00:00",id.lt.${UUID_A})`,
    );
  });

  it('selects exactly the rows that come after the cursor in list order, ties included', () => {
    const rows: QueueCursor[] = [
      lesson(UUID_C, '2026-10-13', '2026-10-13T01:00:00.000000+00:00'),
      lesson(UUID_C, '2026-10-12', '2026-10-12T19:00:00.000000+00:00'),
      lesson(UUID_C, '2026-10-12', '2026-10-12T18:00:00.123456+00:00'),
      lesson(UUID_B, '2026-10-12', '2026-10-12T18:00:00.123456+00:00'),
      lesson(UUID_A, '2026-10-12', '2026-10-12T18:00:00.123456+00:00'),
      lesson(UUID_C, '2026-10-12', '2026-10-12T18:00:00.123455+00:00'),
      lesson(UUID_C, '2026-10-11', '2026-10-11T10:00:00.000000+00:00'),
    ];
    const sorted = [...rows].sort(compareQueueOrder);
    const after = sorted.filter((row) => matchesKeyset(row, cursor));
    const expected = sorted.slice(sorted.findIndex((row) => row.id === UUID_A) + 1);

    expect(after).toEqual(expected);
    // Same date and timestamp but a higher id sorts before the cursor; a microsecond earlier sorts after it.
    expect(after.map((row) => row.createdAt)).toEqual([
      '2026-10-12T18:00:00.123455+00:00',
      '2026-10-11T10:00:00.000000+00:00',
    ]);
  });
});

describe('parseCategorySegmentRequest', () => {
  const valid = {
    scopeIds: [UUID_A, UUID_B],
    cursor: { date: '2026-10-12', createdAt: '2026-10-12T18:00:00.123456+00:00', id: UUID_C },
    snapshotAt: SNAPSHOT,
    limit: 10,
  };

  it('accepts a well-formed request', () => {
    expect(parseCategorySegmentRequest(valid)).toEqual(valid);
  });

  it('accepts the first segment without a cursor and defaults the limit', () => {
    expect(parseCategorySegmentRequest({ scopeIds: [UUID_A], snapshotAt: SNAPSHOT })).toEqual({
      scopeIds: [UUID_A],
      cursor: null,
      snapshotAt: SNAPSHOT,
      limit: CATEGORY_SEGMENT_SIZE,
    });
  });

  it('clamps a large limit to the maximum', () => {
    expect(parseCategorySegmentRequest({ ...valid, limit: 10_000 })?.limit).toBe(MAX_SEGMENT_LIMIT);
  });

  it.each([
    ['no scope', { ...valid, scopeIds: [] }],
    ['a scope id that is not a uuid', { ...valid, scopeIds: ['cat,1'] }],
    ['a snapshot that is not a timestamp', { ...valid, snapshotAt: 'yesterday' }],
    ['a cursor date that is not a date', { ...valid, cursor: { ...valid.cursor, date: '2026-10-12)' } }],
    ['a cursor id that is not a uuid', { ...valid, cursor: { ...valid.cursor, id: 'x.lt.1' } }],
    [
      'a cursor timestamp with filter syntax',
      { ...valid, cursor: { ...valid.cursor, createdAt: '2026-10-12T18:00:00Z,id.eq.1' } },
    ],
    ['a zero limit', { ...valid, limit: 0 }],
    ['a fractional limit', { ...valid, limit: 2.5 }],
    ['a non-object', 'lessons'],
  ])('rejects %s', (_label, raw) => {
    expect(parseCategorySegmentRequest(raw)).toBeNull();
  });
});

interface FakeQuery {
  table: string;
  calls: Record<string, unknown[][]>;
}

/** A chainable stand-in for the PostgREST builder that records every call. */
function fakeCatalog(rows: unknown[], error: unknown = null) {
  const query: FakeQuery = { table: '', calls: {} };
  const builder: Record<string, unknown> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      (query.calls[name] ??= []).push(args);
      return builder;
    };
  for (const name of ['select', 'eq', 'in', 'lte', 'order', 'limit', 'or']) builder[name] = record(name);
  builder.overrideTypes = () => {
    (query.calls.overrideTypes ??= []).push([]);
    return Promise.resolve({ data: rows, error });
  };
  const client = {
    from: (table: string) => {
      query.table = table;
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, query };
}

function lessonRow(id: string, date: string, createdAt: string, parts = 1): LessonWithRelations {
  return {
    id,
    slug: null,
    title: id,
    hebrew_title: id,
    date,
    description: null,
    summary: null,
    duration: 3600,
    audio_url: null,
    audio_url_fallback: null,
    created_at: createdAt,
    series: null,
    audio_files: Array.from({ length: parts }, (_, index) => ({
      id: `${id}-${index}`,
      lesson_id: id,
      file_key: `${id}-${index}.mp3`,
      audio_url: `/api/audio/stream/${id}-${index}.mp3`,
      original_name: null,
      audio_type: null,
      duration: 1200,
      file_size: null,
      sort_order: index,
    })),
  } as unknown as LessonWithRelations;
}

function request(overrides: Partial<CategorySegmentRequest> = {}): CategorySegmentRequest {
  return { scopeIds: [UUID_A, UUID_B], cursor: null, snapshotAt: SNAPSHOT, limit: 2, ...overrides };
}

describe('loadCategoryQueueSegment', () => {
  it('reads published lessons in scope, up to the snapshot, in list order', async () => {
    const { client, query } = fakeCatalog([]);
    await loadCategoryQueueSegment(client, request());

    expect(query.table).toBe('lessons');
    expect(query.calls.eq).toEqual([['is_published', true]]);
    expect(query.calls.in).toEqual([['category_id', [UUID_A, UUID_B]]]);
    expect(query.calls.lte).toEqual([['created_at', SNAPSHOT]]);
    expect(query.calls.order).toEqual([
      ['date', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('applies no keyset filter for the first segment', async () => {
    const { client, query } = fakeCatalog([]);
    await loadCategoryQueueSegment(client, request());
    expect(query.calls.or).toBeUndefined();
  });

  it('applies the keyset filter after a cursor', async () => {
    const cursor: QueueCursor = { date: '2026-10-12', createdAt: '2026-10-12T18:00:00.123456+00:00', id: UUID_C };
    const { client, query } = fakeCatalog([]);
    await loadCategoryQueueSegment(client, request({ cursor }));
    expect(query.calls.or).toEqual([[keysetFilter(cursor)]]);
  });

  it('asks for one row more than the limit to know whether another segment exists', async () => {
    const { client, query } = fakeCatalog([]);
    await loadCategoryQueueSegment(client, request({ limit: 2 }));
    expect(query.calls.limit).toEqual([[3]]);
  });

  it('returns the rows up to the limit, the cursor of the last one, and more to come', async () => {
    const rows = [
      lessonRow(UUID_A, '2026-10-12', '2026-10-12T18:00:00.123456+00:00'),
      lessonRow(UUID_B, '2026-10-11', '2026-10-11T10:00:00.000000+00:00'),
      lessonRow(UUID_C, '2026-10-10', '2026-10-10T10:00:00.000000+00:00'),
    ];
    const { client } = fakeCatalog(rows);

    const segment = await loadCategoryQueueSegment(client, request({ limit: 2 }));

    expect(segment.lessons.map((l) => l.id)).toEqual([UUID_A, UUID_B]);
    expect(segment.cursor).toEqual({ date: '2026-10-11', createdAt: '2026-10-11T10:00:00.000000+00:00', id: UUID_B });
    expect(segment.exhausted).toBe(false);
  });

  it('marks the last segment exhausted and keeps the cursor when nothing is returned', async () => {
    const cursor: QueueCursor = { date: '2026-10-10', createdAt: '2026-10-10T10:00:00.000000+00:00', id: UUID_C };
    const { client } = fakeCatalog([]);

    const segment = await loadCategoryQueueSegment(client, request({ cursor }));

    expect(segment).toEqual({ lessons: [], cursor, exhausted: true });
  });

  it('throws the read error rather than an empty segment', async () => {
    const { client } = fakeCatalog(null as unknown as unknown[], new Error('boom'));
    await expect(loadCategoryQueueSegment(client, request())).rejects.toThrow('boom');
  });
});

describe('segment to tracks', () => {
  it('keeps list order and one track per part', () => {
    const lessons = [
      lessonRow(UUID_A, '2026-10-12', '2026-10-12T18:00:00.000000+00:00', 2),
      lessonRow(UUID_B, '2026-10-11', '2026-10-11T10:00:00.000000+00:00', 1),
    ];

    const tracks = segmentToTracks(lessons);

    expect(tracks.map((t) => `${t.lessonId}:${t.partIndex}/${t.partCount}`)).toEqual([
      `${UUID_A}:0/2`,
      `${UUID_A}:1/2`,
      `${UUID_B}:0/1`,
    ]);
  });

  it('drops a lesson with no audio but keeps the cursor on it', () => {
    const silent = lessonRow(UUID_A, '2026-10-12', '2026-10-12T18:00:00.000000+00:00', 0);
    const page = segmentToPage({
      lessons: [silent],
      cursor: { date: '2026-10-12', createdAt: '2026-10-12T18:00:00.000000+00:00', id: UUID_A },
      exhausted: false,
    });
    expect(page.tracks).toEqual([]);
    expect(page.cursor?.id).toBe(UUID_A);
  });
});

describe('createCategoryQueueSource and nextSegmentRequest', () => {
  it('starts a list-ordered source and asks for the segment after its cursor', () => {
    const cursor: QueueCursor = { date: '2026-10-12', createdAt: '2026-10-12T18:00:00.000000+00:00', id: UUID_A };
    const source = createCategoryQueueSource({
      categoryId: 'cat',
      scopeIds: [UUID_A, UUID_B],
      snapshotAt: SNAPSHOT,
      cursor,
      exhausted: false,
      sessionId: 'session-x',
    });

    expect(source).toMatchObject({
      kind: 'category',
      categoryId: 'cat',
      order: 'list',
      exhausted: false,
      sessionId: 'session-x',
    });
    expect(nextSegmentRequest(source)).toEqual({
      scopeIds: [UUID_A, UUID_B],
      cursor,
      snapshotAt: SNAPSHOT,
      limit: CATEGORY_SEGMENT_SIZE,
    });
  });

  it('gives every new session its own id when none is passed', () => {
    const base = { categoryId: 'cat', scopeIds: [UUID_A], snapshotAt: SNAPSHOT, cursor: null, exhausted: true };
    const first = createCategoryQueueSource(base);
    const second = createCategoryQueueSource(base);
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.sessionId.length).toBeGreaterThan(0);
  });
});

describe('seedFromCategoryRows', () => {
  /** The cached list rows, newest first: row i is listed at position i. */
  function rows(count: number, audioAt: (index: number) => boolean = () => true): LessonWithRelations[] {
    return Array.from({ length: count }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      return lessonRow(
        id,
        '2026-10-12',
        `2026-10-12T18:00:00.${String(index).padStart(6, '0')}+00:00`,
        audioAt(index) ? 1 : 0,
      );
    });
  }

  it('is an exhausted empty seed for a category without lessons', () => {
    expect(seedFromCategoryRows([])).toEqual({ lessons: [], cursor: null, exhausted: true });
  });

  it('takes the whole short list, with the cursor on its last row, as exhausted', () => {
    const list = rows(3);

    const seed = seedFromCategoryRows(list);

    expect(seed.exhausted).toBe(true);
    expect(seed.lessons).toHaveLength(3);
    expect(seed.cursor).toEqual({ date: list[2].date, createdAt: list[2].created_at, id: list[2].id });
  });

  it('treats exactly one page of a complete list as exhausted', () => {
    const seed = seedFromCategoryRows(rows(CATEGORY_SEGMENT_SIZE));

    expect(seed.exhausted).toBe(true);
    expect(seed.lessons).toHaveLength(CATEGORY_SEGMENT_SIZE);
  });

  it('cuts the seed at one page and leaves the rest to the segments after its cursor', () => {
    const list = rows(CATEGORY_SEGMENT_SIZE + 1);

    const seed = seedFromCategoryRows(list);

    expect(seed.exhausted).toBe(false);
    expect(seed.lessons).toHaveLength(CATEGORY_SEGMENT_SIZE);
    expect(seed.cursor?.id).toBe(list[CATEGORY_SEGMENT_SIZE - 1].id);
  });

  it('is never exhausted when the cached list reached its limit, even at one page', () => {
    const seed = seedFromCategoryRows(rows(CATEGORY_SEGMENT_SIZE), CATEGORY_SEGMENT_SIZE);

    expect(seed.exhausted).toBe(false);
    expect(seed.cursor?.id).toBe(rows(CATEGORY_SEGMENT_SIZE)[CATEGORY_SEGMENT_SIZE - 1].id);
  });

  it('uses the default list limit of the category page', () => {
    expect(seedFromCategoryRows(rows(CATEGORY_LIST_LIMIT)).exhausted).toBe(false);
    expect(seedFromCategoryRows(rows(CATEGORY_LIST_LIMIT - 1)).exhausted).toBe(false);
  });

  it('keeps the cursor on a silent row while leaving it out of the tracks', () => {
    const list = rows(CATEGORY_SEGMENT_SIZE, (index) => index !== CATEGORY_SEGMENT_SIZE - 1);

    const seed = seedFromCategoryRows(list);

    expect(seed.lessons).toHaveLength(CATEGORY_SEGMENT_SIZE - 1);
    expect(seed.cursor?.id).toBe(list[CATEGORY_SEGMENT_SIZE - 1].id);
  });

  it('builds a cursor the segment request validation accepts', () => {
    const seed = seedFromCategoryRows(rows(CATEGORY_SEGMENT_SIZE + 5));

    expect(
      parseCategorySegmentRequest({ scopeIds: [UUID_A], snapshotAt: SNAPSHOT, cursor: seed.cursor }),
    ).not.toBeNull();
  });
});
