import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, LessonWithRelations } from '@/types/database';
import { matchTags, type TagCount } from '@/lib/tag-links';
import { getAllCategories } from './queries';
import { LESSON_AUDIO_FILES } from './lesson-selects';

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
  lessonIds?: string[];
  categoryIds?: string[];
  /** Only lessons carrying this (normalized) tag. */
  tag?: string;
}

export interface LessonListReader {
  getAllCategories(): Promise<Category[]>;
  getAudioLessonIds(audioType: string): Promise<string[]>;
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
  let lessonIds: string[] | undefined;
  let categoryIds: string[] | undefined;

  if (params.audioTypeFilter) {
    lessonIds = await reader.getAudioLessonIds(params.audioTypeFilter);
  }

  if (params.categoryFilter) {
    categoryIds = [
      params.categoryFilter,
      ...(await reader.getChildCategoryIds(params.categoryFilter)),
    ];
  }

  return { lessonIds, categoryIds, tag: params.tagFilter || undefined };
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
    const matchedTags = params.q ? matchTags(tagCounts, params.q) : [];

    if (filters.lessonIds?.length === 0) {
      return {
        ok: true,
        lessons: [],
        hasMore: false,
        isSearchMode: Boolean(params.q),
        allCategories,
        tagCounts,
        matchedTags,
      };
    }

    if (params.q) {
      const lessons = await reader.searchLessons(params.q, filters, matchedTags);
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

    if (filters.lessonIds?.length === 0) {
      return {
        ok: true,
        lessons: [],
        hasMore: false,
      };
    }

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

const LESSON_LIST_SELECT = `*, series(name, hebrew_name), category:categories(id, hebrew_name), ${LESSON_AUDIO_FILES}`;
export const SEARCH_RESULT_LIMIT = 50;

/** The subset of the PostgREST filter builder the list filters use. */
export interface LessonFilterableQuery<Q> {
  in(column: string, values: readonly string[]): Q;
  contains(column: string, value: readonly string[]): Q;
}

/** Applies the list filters; the tag uses array containment (`tags @> {tag}`, GIN-indexed). */
export function applyLessonFilters<Q extends LessonFilterableQuery<Q>>(
  query: Q,
  filters: LessonQueryFilters,
): Q {
  let next = query;
  if (filters.lessonIds) next = next.in('id', filters.lessonIds);
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
  return {
    getAllCategories: () => getAllCategories(supabase),

    getTagCounts: () => fetchTagCounts(supabase),

    async getAudioLessonIds(audioType) {
      const result = await supabase
        .from('lesson_audio')
        .select('lesson_id')
        .eq('audio_type', audioType);
      const data = throwIfError(result);
      return [...new Set((data || []).map((row: { lesson_id: string }) => row.lesson_id))];
    },

    async getChildCategoryIds(categoryId) {
      const result = await supabase
        .from('categories')
        .select('id')
        .eq('parent_id', categoryId);
      const data = throwIfError(result);
      return (data || []).map((row: { id: string }) => row.id);
    },

    async searchLessons(queryText, filters, matchedTags) {
      const published = () => supabase.from('lessons').select(LESSON_LIST_SELECT).eq('is_published', true);
      // LIKE-escape, then turn or() syntax characters into single-character wildcards.
      const pattern = `%${queryText.replace(/[%_\\]/g, '\\$&').replace(/[,()"]/g, '_')}%`;
      const textQuery = applyLessonFilters(
        published().or(`title.ilike.${pattern},hebrew_title.ilike.${pattern},description.ilike.${pattern}`),
        filters,
      )
        .order('date', { ascending: false })
        .limit(SEARCH_RESULT_LIMIT);
      const tagQuery =
        matchedTags.length > 0
          ? applyLessonFilters(published().overlaps('tags', matchedTags), filters)
              .order('date', { ascending: false })
              .limit(SEARCH_RESULT_LIMIT)
          : null;

      const [textResult, tagResult] = await Promise.all([textQuery, tagQuery]);
      const textLessons = (throwIfError(textResult) || []) as LessonWithRelations[];
      const tagLessons = tagResult ? ((throwIfError(tagResult) || []) as LessonWithRelations[]) : [];
      return mergeSearchResults(textLessons, tagLessons);
    },

    async getLessonsPage(offset, pageSize, filters) {
      const query = applyLessonFilters(
        supabase.from('lessons').select(LESSON_LIST_SELECT).eq('is_published', true),
        filters,
      ).order('date', { ascending: false });

      const result = await query.range(offset, offset + pageSize);
      return (throwIfError(result) || []) as LessonWithRelations[];
    },
  };
}
