import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, LessonWithRelations } from '@/types/database';
import { getAllCategories } from './queries';

export const DEFAULT_LESSON_PAGE_SIZE = 20;

export type LessonListFailureCode = 'unconfigured' | 'network' | 'schema' | 'query';

export type LessonListResult =
  | {
      ok: true;
      lessons: LessonWithRelations[];
      hasMore: boolean;
      isSearchMode: boolean;
      allCategories: Category[];
    }
  | {
      ok: false;
      code: LessonListFailureCode;
      message: string;
      allCategories: Category[];
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
}

export interface LessonListReader {
  getAllCategories(): Promise<Category[]>;
  getAudioLessonIds(audioType: string): Promise<string[]>;
  getChildCategoryIds(categoryId: string): Promise<string[]>;
  searchLessons(query: string, filters: LessonQueryFilters): Promise<LessonWithRelations[]>;
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
  pageSize?: number;
}

export interface PaginatedLessonListParams {
  offset: number;
  limit: number;
  audioTypeFilter?: string;
  categoryFilter?: string;
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
  return error instanceof Error ? error.message : 'Failed to load lessons.';
}

function failure(
  error: unknown,
  allCategories: Category[] = [],
): Extract<LessonListResult, { ok: false }> {
  return {
    ok: false,
    code: classifyLessonListError(error),
    message: getErrorMessage(error),
    allCategories,
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
  params: Pick<InitialLessonListParams, 'audioTypeFilter' | 'categoryFilter'>,
) {
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

  return { lessonIds, categoryIds };
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
    };
  }

  let allCategories: Category[] = [];

  try {
    allCategories = await reader.getAllCategories();
    const filters = await getFilters(reader, params);

    if (filters.lessonIds?.length === 0) {
      return {
        ok: true,
        lessons: [],
        hasMore: false,
        isSearchMode: Boolean(params.q),
        allCategories,
      };
    }

    if (params.q) {
      const lessons = await reader.searchLessons(params.q, filters);
      return {
        ok: true,
        lessons,
        hasMore: false,
        isSearchMode: true,
        allCategories,
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
    };
  } catch (error) {
    return failure(error, allCategories);
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

export function createSupabaseLessonListReader(supabase: SupabaseClient): LessonListReader {
  return {
    getAllCategories: () => getAllCategories(supabase),

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

    async searchLessons(queryText, filters) {
      const escaped = queryText.replace(/[%_\\]/g, '\\$&');
      let query = supabase
        .from('lessons')
        .select('*, series(name, hebrew_name), category:categories(id, hebrew_name)')
        .eq('is_published', true)
        .or(`title.ilike.%${escaped}%,hebrew_title.ilike.%${escaped}%,description.ilike.%${escaped}%`)
        .order('date', { ascending: false })
        .limit(50);

      if (filters.lessonIds) query = query.in('id', filters.lessonIds);
      if (filters.categoryIds) query = query.in('category_id', filters.categoryIds);

      const result = await query;
      return (throwIfError(result) || []) as LessonWithRelations[];
    },

    async getLessonsPage(offset, pageSize, filters) {
      let query = supabase
        .from('lessons')
        .select('*, series(name, hebrew_name), category:categories(id, hebrew_name)')
        .eq('is_published', true)
        .order('date', { ascending: false });

      if (filters.lessonIds) query = query.in('id', filters.lessonIds);
      if (filters.categoryIds) query = query.in('category_id', filters.categoryIds);

      const result = await query.range(offset, offset + pageSize);
      return (throwIfError(result) || []) as LessonWithRelations[];
    },
  };
}
