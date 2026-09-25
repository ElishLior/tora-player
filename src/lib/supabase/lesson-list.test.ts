import { describe, expect, it, vi } from 'vitest';
import {
  applyLessonFilters,
  loadInitialLessonList,
  loadPaginatedLessonList,
  mergeSearchResults,
  normalizeSearchQuery,
  type LessonFilterableQuery,
  type LessonListReader,
} from './lesson-list';
import type { Category, LessonWithRelations } from '@/types/database';

const category: Category = {
  id: 'cat-1',
  name: 'Lessons',
  hebrew_name: 'שיעורים',
  description: null,
  icon: null,
  sort_order: 1,
  parent_id: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const lesson: LessonWithRelations = {
  id: 'lesson-1',
  title: 'Lesson',
  hebrew_title: 'שיעור',
  description: null,
  date: '2026-01-01',
  audio_url: null,
  audio_url_fallback: null,
  audio_url_original: null,
  duration: 0,
  file_size: 0,
  codec: 'mp3',
  recorded_at: null,
  series_id: null,
  part_number: null,
  parent_lesson_id: null,
  source_text: null,
  source_type: 'upload',
  is_published: true,
  hebrew_date: null,
  parsha: null,
  teacher: null,
  location: null,
  summary: null,
  lesson_type: null,
  seder_number: null,
  category_id: null,
  tags: [],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

function createReader(overrides: Partial<LessonListReader> = {}): LessonListReader {
  return {
    getAllCategories: vi.fn(async () => [category]),
    getChildCategoryIds: vi.fn(async () => []),
    getTagCounts: vi.fn(async () => [
      { tag: 'אמונה ובטחון', lesson_count: 4 },
      { tag: 'שבת', lesson_count: 2 },
    ]),
    searchLessons: vi.fn(async () => [lesson]),
    getLessonsPage: vi.fn(async () => [lesson]),
    ...overrides,
  };
}

describe('loadInitialLessonList', () => {
  it('returns an unconfigured failure instead of an empty lesson list when no reader exists', async () => {
    const result = await loadInitialLessonList(null, {});

    expect(result).toMatchObject({
      ok: false,
      code: 'unconfigured',
    });
  });

  it('returns a query failure when category loading throws', async () => {
    const reader = createReader({
      getAllCategories: vi.fn(async () => {
        throw new Error('relation "categories" does not exist');
      }),
    });

    const result = await loadInitialLessonList(reader, {});

    expect(result).toMatchObject({
      ok: false,
      code: 'schema',
    });
  });

  it('preserves Supabase plain-object error messages', async () => {
    const reader = createReader({
      getLessonsPage: vi.fn(async () => {
        throw {
          code: '42P01',
          message: 'relation "lessons" does not exist',
        };
      }),
    });

    const result = await loadInitialLessonList(reader, {});

    expect(result).toMatchObject({
      ok: false,
      code: 'schema',
      message: 'relation "lessons" does not exist',
    });
  });

  it('returns paginated failures with the original Supabase message', async () => {
    const reader = createReader({
      getLessonsPage: vi.fn(async () => {
        throw {
          code: 'PGRST301',
          message: 'JWT expired',
        };
      }),
    });

    const result = await loadPaginatedLessonList(reader, {
      offset: 20,
      limit: 20,
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'query',
      message: 'JWT expired',
    });
  });

  it('keeps a true empty result distinct from a data-loading failure', async () => {
    const reader = createReader({
      getLessonsPage: vi.fn(async () => []),
    });

    const result = await loadInitialLessonList(reader, {});

    expect(result).toMatchObject({
      ok: true,
      lessons: [],
      hasMore: false,
      isSearchMode: false,
    });
  });
});

/** Records the filter calls a PostgREST builder would receive. */
class RecordingQuery implements LessonFilterableQuery<RecordingQuery> {
  calls: Array<[string, string, string | readonly string[]]> = [];
  eq(column: string, value: string) {
    this.calls.push(['eq', column, value]);
    return this;
  }
  in(column: string, values: readonly string[]) {
    this.calls.push(['in', column, values]);
    return this;
  }
  contains(column: string, value: readonly string[]) {
    this.calls.push(['contains', column, value]);
    return this;
  }
}

describe('lesson list tag filter', () => {
  it('filters by tag with array containment, combined with the other filters', () => {
    const query = applyLessonFilters(new RecordingQuery(), {
      audioType: 'סידור',
      categoryIds: ['cat-1', 'cat-2'],
      tag: 'אמונה ובטחון',
    });

    expect(query.calls).toEqual([
      ['eq', 'audio_type_match.audio_type', 'סידור'],
      ['in', 'category_id', ['cat-1', 'cat-2']],
      ['contains', 'tags', ['אמונה ובטחון']],
    ]);
  });

  it('adds no tag condition without a tag', () => {
    expect(applyLessonFilters(new RecordingQuery(), {}).calls).toEqual([]);
  });

  it('passes the tag and audio type params to both the first page and later pages', async () => {
    const getLessonsPage = vi.fn(async () => [lesson]);
    const reader = createReader({ getLessonsPage });

    await loadInitialLessonList(reader, { tagFilter: 'שבת', categoryFilter: 'cat-1', audioTypeFilter: 'סידור' });
    await loadPaginatedLessonList(reader, { offset: 20, limit: 20, tagFilter: 'שבת' });

    expect(getLessonsPage).toHaveBeenNthCalledWith(1, 0, 20, {
      audioType: 'סידור',
      categoryIds: ['cat-1'],
      tag: 'שבת',
    });
    expect(getLessonsPage).toHaveBeenNthCalledWith(2, 20, 20, {
      audioType: undefined,
      categoryIds: undefined,
      tag: 'שבת',
    });
  });

  it('searches lessons of tags matching the query and reports those tags', async () => {
    const searchLessons = vi.fn(async () => [lesson]);
    const reader = createReader({ searchLessons });

    const result = await loadInitialLessonList(reader, { q: '#בטחון', tagFilter: 'שבת' });

    expect(searchLessons).toHaveBeenCalledWith('#בטחון', expect.objectContaining({ tag: 'שבת' }), [
      'אמונה ובטחון',
    ]);
    expect(result).toMatchObject({ ok: true, isSearchMode: true, matchedTags: ['אמונה ובטחון'] });
  });
});

describe('normalizeSearchQuery', () => {
  it('strips niqqud and cantillation so pointed input matches unpointed titles', () => {
    expect(normalizeSearchQuery('בְּרֵאשִׁ֖ית')).toBe('בראשית');
    expect(normalizeSearchQuery('עֵץ חַיִּים')).toBe('עץ חיים');
  });

  it('strips the marks of pointed presentation forms', () => {
    // U+FB2A is shin with shin dot as a single code point.
    expect(normalizeSearchQuery('\uFB2Aבת')).toBe('שבת');
  });

  it('keeps Hebrew punctuation and accented Latin text intact', () => {
    expect(normalizeSearchQuery('בית־המקדש')).toBe('בית־המקדש');
    expect(normalizeSearchQuery('café')).toBe('café');
  });

  it('trims and collapses whitespace; missing or empty input is empty', () => {
    expect(normalizeSearchQuery('  אמונה \n  ובטחון ')).toBe('אמונה ובטחון');
    expect(normalizeSearchQuery(undefined)).toBe('');
    expect(normalizeSearchQuery('ְ ')).toBe('');
  });

  it('searches and matches tags with the normalized query', async () => {
    const searchLessons = vi.fn(async () => [lesson]);
    const reader = createReader({ searchLessons });

    const result = await loadInitialLessonList(reader, { q: ' בִּטָּחוֹן ' });

    expect(searchLessons).toHaveBeenCalledWith('בטחון', expect.any(Object), ['אמונה ובטחון']);
    expect(result).toMatchObject({ ok: true, isSearchMode: true, matchedTags: ['אמונה ובטחון'] });
  });

  it('lists lessons instead of searching when the query is only marks', async () => {
    const searchLessons = vi.fn(async () => [lesson]);
    const getLessonsPage = vi.fn(async () => [lesson]);
    const reader = createReader({ searchLessons, getLessonsPage });

    const result = await loadInitialLessonList(reader, { q: 'ְּ' });

    expect(searchLessons).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, isSearchMode: false });
  });
});

describe('mergeSearchResults', () => {
  it('unions text and tag matches without duplicates, newest first, capped', () => {
    const at = (id: string, date: string) => ({ ...lesson, id, date });
    const merged = mergeSearchResults(
      [at('a', '2026-03-01'), at('b', '2026-01-01')],
      [at('b', '2026-01-01'), at('c', '2026-02-01')],
      2,
    );
    expect(merged.map((l) => l.id)).toEqual(['a', 'c']);
  });
});
