import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, LessonWithRelations } from '@/types/database';
import { matchTags, type TagCount } from '@/lib/tag-links';
import { getAllCategories } from './queries';
import { LESSON_AUDIO_FILES, LESSON_CARD_COLUMNS } from './lesson-selects';

export const DEFAULT_LESSON_PAGE_SIZE = 20;

export type LessonListFailureCode = 'unconfigured' | 'network' | 'schema' | 'query';

export type LessonListResult =
  | {
      ok: true;
      lessons: LessonWithRelations[];
      hasMore: boolean;
      isSearchMode: boolean;
      allCategories: Category[];
      /** Every tag on a published lesson, most used first. */
      tagCounts: TagCount[];
      /** Search mode: tags whose text matches the query (their lessons are in the results). */
      matchedTags: string[];
    }
  | {
      ok: false;
      code: LessonListFailureCode;
      message: string;
      allCategories: Category[];
      tagCounts: TagCount[];
    };

export type PaginatedLessonListResult =
  | {
      ok: true;
      lessons: LessonWithRelations[];
      hasMore: boolean;
    }
  | {
      ok: false;
      code: LessonListFailureCode;
      message: string;
    };

export interface LessonQueryFilters {
  /** Only lessons with a part of this audio type (`lesson_audio.audio_type`). */
  audioType?: string;
  categoryIds?: string[];
  /** Only lessons carrying this (normalized) tag. */
  tag?: string;
}

export interface LessonListReader {
  getAllCategories(): Promise<Category[]>;
  getChildCategoryIds(categoryId: string): Promise<string[]>;
  getTagCounts(): Promise<TagCount[]>;
  /** Text matches plus lessons carrying any of `matchedTags`, newest first. */
  searchLessons(
    query: string,
    filters: LessonQueryFilters,
    matchedTags: string[],
  ): Promise<LessonWithRelations[]>;
  getLessonsPage(
    offset: number,
    pageSize: number,
    filters: LessonQueryFilters,
  ): Promise<LessonWithRelations[]>;
}

export interface InitialLessonListParams {
  q?: string;
  audioTypeFilter?: string;
  categoryFilter?: string;
  tagFilter?: string;
  pageSize?: number;
}

export interface PaginatedLessonListParams {
  offset: number;
  limit: number;
  audioTypeFilter?: string;
  categoryFilter?: string;
  tagFilter?: string;
}

function classifyLessonListError(error: unknown): LessonListFailureCode {
  const errorLike = error as { code?: unknown; message?: unknown };
  const code = typeof errorLike?.code === 'string' ? errorLike.code : '';
  const message = typeof errorLike?.message === 'string' ? errorLike.message.toLowerCase() : '';

  if (
    code.startsWith('42') ||
    message.includes('column') ||
    message.includes('relation') ||
    message.includes('table') ||
    message.includes('schema') ||
    message.includes('does not exist')
  ) {
    return 'schema';
  }

  if (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('enotfound') ||
    message.includes('timeout')
  ) {
    return 'network';
  }

  return 'query';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return 'Failed to load lessons.';
}

function failure(
  error: unknown,
  allCategories: Category[] = [],
  tagCounts: TagCount[] = [],
): Extract<LessonListResult, { ok: false }> {
  return {
    ok: false,
    code: classifyLessonListError(error),
    message: getErrorMessage(error),
    allCategories,
    tagCounts,
  };
}

function paginatedFailure(error: unknown): Extract<PaginatedLessonListResult, { ok: false }> {
  return {
    ok: false,
    code: classifyLessonListError(error),
    message: getErrorMessage(error),
  };
}

async function getFilters(
  reader: LessonListReader,
  params: Pick<InitialLessonListParams, 'audioTypeFilter' | 'categoryFilter' | 'tagFilter'>,
): Promise<LessonQueryFilters> {
  const categoryIds = params.categoryFilter
    ? [params.categoryFilter, ...(await reader.getChildCategoryIds(params.categoryFilter))]
    : undefined;

  return {
    audioType: params.audioTypeFilter || undefined,
    categoryIds,
    tag: params.tagFilter || undefined,
  };
}

/** Hebrew niqqud and cantillation: the combining marks of the Hebrew block (not maqaf/paseq/sof pasuq). */
const HEBREW_MARKS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

/**
 * Search text as matched against titles, descriptions and tags: Hebrew niqqud
 * and cantillation removed (stored titles are unpointed; NFD first so pointed
 * presentation forms like U+FB2A lose their marks too), whitespace collapsed.
 */
export function normalizeSearchQuery(raw: string | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(HEBREW_MARKS, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function loadInitialLessonList(
  reader: LessonListReader | null,
  params: InitialLessonListParams,
): Promise<LessonListResult> {
  if (!reader) {
    return {
      ok: false,
      code: 'unconfigured',
      message: 'Supabase is not configured.',
      allCategories: [],
      tagCounts: [],
    };
  }

  let allCategories: Category[] = [];
  let tagCounts: TagCount[] = [];

  try {
    [allCategories, tagCounts] = await Promise.all([reader.getAllCategories(), reader.getTagCounts()]);
    const filters = await getFilters(reader, params);
    const q = normalizeSearchQuery(params.q);
    const matchedTags = q ? matchTags(tagCounts, q) : [];

    if (q) {
      const lessons = await reader.searchLessons(q, filters, matchedTags);
      return {
        ok: true,
        lessons,
        hasMore: false,
        isSearchMode: true,
        allCategories,
        tagCounts,
        matchedTags,
      };
    }

    const pageSize = params.pageSize ?? DEFAULT_LESSON_PAGE_SIZE;
    const page = await reader.getLessonsPage(0, pageSize, filters);
    const hasMore = page.length > pageSize;

    return {
      ok: true,
      lessons: hasMore ? page.slice(0, pageSize) : page,
      hasMore,
      isSearchMode: false,
      allCategories,
      tagCounts,
      matchedTags,
    };
  } catch (error) {
    return failure(error, allCategories, tagCounts);
  }
}

export async function loadPaginatedLessonList(
  reader: LessonListReader | null,
  params: PaginatedLessonListParams,
): Promise<PaginatedLessonListResult> {
  if (!reader) {
    return {
      ok: false,
      code: 'unconfigured',
      message: 'Supabase is not configured.',
    };
  }

  try {
    const filters = await getFilters(reader, params);
    const page = await reader.getLessonsPage(params.offset, params.limit, filters);
    const hasMore = page.length > params.limit;

    return {
      ok: true,
      lessons: hasMore ? page.slice(0, params.limit) : page,
      hasMore,
    };
  } catch (error) {
    return paginatedFailure(error);
  }
}

function throwIfError<T>(result: { data: T | null; error: unknown }) {
  if (result.error) throw result.error;
  return result.data;
}

const LESSON_LIST_SELECT = `${LESSON_CARD_COLUMNS}, series(name, hebrew_name), category:categories(id, hebrew_name), ${LESSON_AUDIO_FILES}`;
export const SEARCH_RESULT_LIMIT = 50;

/**
 * Extra embed that exists only to filter by audio type: `!inner` drops lessons
 * with no matching part, while `audio_files` keeps every part for the queue.
 */
const AUDIO_TYPE_MATCH = 'audio_type_match';

/** The subset of the PostgREST filter builder the list filters use. */
export interface LessonFilterableQuery<Q> {
  eq(column: string, value: string): Q;
  in(column: string, values: readonly string[]): Q;
  contains(column: string, value: readonly string[]): Q;
}

/**
 * Applies the list filters. With an audio type the query must also select the
 * `AUDIO_TYPE_MATCH` inner embed (one request instead of an id list); the tag
 * uses array containment (`tags @> {tag}`, GIN-indexed).
 */
export function applyLessonFilters<Q extends LessonFilterableQuery<Q>>(
  query: Q,
  filters: LessonQueryFilters,
): Q {
  let next = query;
  if (filters.audioType) next = next.eq(`${AUDIO_TYPE_MATCH}.audio_type`, filters.audioType);
  if (filters.categoryIds) next = next.in('category_id', filters.categoryIds);
  if (filters.tag) next = next.contains('tags', [filters.tag]);
  return next;
}

/** Union of two newest-first result lists without duplicates, newest first, capped. */
export function mergeSearchResults(
  a: LessonWithRelations[],
  b: LessonWithRelations[],
  limit = SEARCH_RESULT_LIMIT,
): LessonWithRelations[] {
  const byId = new Map<string, LessonWithRelations>();
  for (const lesson of [...a, ...b]) if (!byId.has(lesson.id)) byId.set(lesson.id, lesson);
  return [...byId.values()]
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
    .slice(0, limit);
}

/** Tag cloud data from `lesson_tag_counts()` (published lessons only), most used first. */
export async function fetchTagCounts(supabase: SupabaseClient): Promise<TagCount[]> {
  const data = throwIfError(await supabase.rpc('lesson_tag_counts'));
  return ((data ?? []) as TagCount[]).map((row) => ({ tag: row.tag, lesson_count: Number(row.lesson_count) }));
}

export function createSupabaseLessonListReader(supabase: SupabaseClient): LessonListReader {
  /** Published lessons for a list, filtered; the audio type needs the inner-joined embed. */
  const publishedLessons = (filters: LessonQueryFilters) => {
    // Widened to string: the select type parser can't handle this union; rows are typed with overrideTypes.
    const select: string = filters.audioType
      ? `${LESSON_LIST_SELECT}, ${AUDIO_TYPE_MATCH}:lesson_audio!inner(audio_type)`
      : LESSON_LIST_SELECT;
    return applyLessonFilters(supabase.from('lessons').select(select).eq('is_published', true), filters);
  };

  return {
    getAllCategories: () => getAllCategories(supabase),

    getTagCounts: () => fetchTagCounts(supabase),

    async getChildCategoryIds(categoryId) {
      const result = await supabase
        .from('categories')
        .select('id')
        .eq('parent_id', categoryId);
      const data = throwIfError(result);
      return (data || []).map((row: { id: string }) => row.id);
    },

    async searchLessons(queryText, filters, matchedTags) {
      // LIKE-escape, then turn or() syntax characters into single-character wildcards.
      const pattern = `%${queryText.replace(/[%_\\]/g, '\\$&').replace(/[,()"]/g, '_')}%`;
      const textQuery = publishedLessons(filters)
        .or(`title.ilike.${pattern},hebrew_title.ilike.${pattern},description.ilike.${pattern}`)
        .order('date', { ascending: false })
        .limit(SEARCH_RESULT_LIMIT)
        .overrideTypes<LessonWithRelations[], { merge: false }>();
      const tagQuery =
        matchedTags.length > 0
          ? publishedLessons(filters)
              .overlaps('tags', matchedTags)
              .order('date', { ascending: false })
              .limit(SEARCH_RESULT_LIMIT)
              .overrideTypes<LessonWithRelations[], { merge: false }>()
          : null;

      const [textResult, tagResult] = await Promise.all([textQuery, tagQuery]);
      const textLessons = throwIfError(textResult) ?? [];
      const tagLessons = tagResult ? (throwIfError(tagResult) ?? []) : [];
      return mergeSearchResults(textLessons, tagLessons);
    },

    async getLessonsPage(offset, pageSize, filters) {
      const result = await publishedLessons(filters)
        .order('date', { ascending: false })
        .range(offset, offset + pageSize)
        .overrideTypes<LessonWithRelations[], { merge: false }>();
      return throwIfError(result) ?? [];
    },
  };
}
