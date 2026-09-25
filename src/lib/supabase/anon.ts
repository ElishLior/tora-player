import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { createSupabaseLessonListReader, fetchTagCounts, type LessonListReader } from './lesson-list';
import {
  getAllCategories,
  getAllSeries,
  getCategoriesTree,
  getCategoryById,
  getCategoryLessonCounts,
  getLessonsByCategory,
  getLessonsBySeries,
  getRecentLessons,
  getSeriesById,
} from './queries';
import { getShortLessons } from './shorts';

/** Every cached catalog read carries this tag; catalog writes call revalidateCatalog(). */
const CATALOG_TAG = 'catalog';
const CATALOG_CACHE = { tags: [CATALOG_TAG], revalidate: 300 };

let anonClient: SupabaseClient | null = null;

/**
 * Cookie-less anon client for public catalog reads. RLS shows it exactly what
 * every visitor sees (published lessons, all categories and series), so its
 * results can be cached and shared between users. Never use it for per-user data.
 */
export function createAnonSupabaseClient(): SupabaseClient {
  if (anonClient) return anonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for catalog reads.');
  }
  anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anonClient;
}

/** After a catalog write, refresh public pages as well as independently cached feeds and the sitemap. */
export function revalidateCatalog() {
  revalidateTag(CATALOG_TAG);
  revalidatePath('/[locale]', 'layout');
  revalidatePath('/feed.xml');
  revalidatePath('/series/[seriesId]/feed.xml', 'page');
  revalidatePath('/sitemap.xml');
}

// Cached public catalog reads (5 minutes, or until revalidateCatalog()).
// Arguments are part of each cache key.

export const getCachedRecentLessons = unstable_cache(
  (limit: number) => getRecentLessons(createAnonSupabaseClient(), limit),
  ['catalog', 'recent-lessons'],
  CATALOG_CACHE,
);

export const getCachedShortLessons = unstable_cache(
  (limit?: number) => getShortLessons(createAnonSupabaseClient(), limit),
  ['catalog', 'short-lessons'],
  CATALOG_CACHE,
);

export const getCachedAllCategories = unstable_cache(
  () => getAllCategories(createAnonSupabaseClient()),
  ['catalog', 'all-categories'],
  CATALOG_CACHE,
);

export const getCachedCategoriesTree = unstable_cache(
  () => getCategoriesTree(createAnonSupabaseClient()),
  ['catalog', 'categories-tree'],
  CATALOG_CACHE,
);

export const getCachedCategoryById = unstable_cache(
  (id: string) => getCategoryById(createAnonSupabaseClient(), id),
  ['catalog', 'category-by-id'],
  CATALOG_CACHE,
);

export const getCachedCategoryLessonCounts = unstable_cache(
  () => getCategoryLessonCounts(createAnonSupabaseClient()),
  ['catalog', 'category-lesson-counts'],
  CATALOG_CACHE,
);

export const getCachedCategoryLessons = unstable_cache(
  (categoryId: string) => getLessonsByCategory(createAnonSupabaseClient(), categoryId),
  ['catalog', 'category-lessons'],
  CATALOG_CACHE,
);

export const getCachedAllSeries = unstable_cache(
  () => getAllSeries(createAnonSupabaseClient()),
  ['catalog', 'all-series'],
  CATALOG_CACHE,
);

export const getCachedSeriesById = unstable_cache(
  (id: string) => getSeriesById(createAnonSupabaseClient(), id),
  ['catalog', 'series-by-id'],
  CATALOG_CACHE,
);

export const getCachedSeriesLessons = unstable_cache(
  (seriesId: string) => getLessonsBySeries(createAnonSupabaseClient(), seriesId),
  ['catalog', 'series-lessons'],
  CATALOG_CACHE,
);

export const getCachedTagCounts = unstable_cache(
  () => fetchTagCounts(createAnonSupabaseClient()),
  ['catalog', 'tag-counts'],
  CATALOG_CACHE,
);

/**
 * Lesson list reader for public pages: anon client, with categories and tag
 * counts from the cache (the filtered lesson pages themselves are not cached).
 */
export function createCatalogLessonListReader(): LessonListReader {
  return {
    ...createSupabaseLessonListReader(createAnonSupabaseClient()),
    getAllCategories: getCachedAllCategories,
    getTagCounts: getCachedTagCounts,
  };
}
