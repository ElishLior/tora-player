import { describe, expect, it, vi } from 'vitest';
import { loadInitialLessonList, type LessonListReader } from './lesson-list';
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
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

function createReader(overrides: Partial<LessonListReader> = {}): LessonListReader {
  return {
    getAllCategories: vi.fn(async () => [category]),
    getAudioLessonIds: vi.fn(async () => ['lesson-1']),
    getChildCategoryIds: vi.fn(async () => []),
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

  it('does not query lessons when an audio type filter has no matching lesson ids', async () => {
    const getLessonsPage = vi.fn(async () => [lesson]);
    const reader = createReader({
      getAudioLessonIds: vi.fn(async () => []),
      getLessonsPage,
    });

    const result = await loadInitialLessonList(reader, { audioTypeFilter: 'סידור' });

    expect(result).toMatchObject({
      ok: true,
      lessons: [],
      hasMore: false,
    });
    expect(getLessonsPage).not.toHaveBeenCalled();
  });
});
