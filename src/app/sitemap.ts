import type { MetadataRoute } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { categoryPath, lessonPath, pageUrl, playlistPath, seriesPath } from '@/config/site';
import { createAnonSupabaseClient } from '@/lib/supabase/anon';
import { fetchTagCounts } from '@/lib/supabase/lesson-list';
import { tagPath } from '@/lib/tag-links';

// CI has no database: populate the public sitemap from live data on its first request.
export const dynamic = 'force-dynamic';

/** Listing pages worth indexing; personal and admin pages are excluded (see robots.ts). */
const LISTING_PATHS = ['/', '/lessons', '/shorts', '/series', '/categories', '/tags', '/playlists'];

/** PostgREST returns at most 1000 rows per request. */
const PAGE_SIZE = 1000;

interface Row {
  id: string;
  updated_at: string;
}

async function loadPublishedLessons(supabase: SupabaseClient): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, updated_at')
      .eq('is_published', true)
      .order('date', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function loadRows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Row[];
}

async function catalogEntries(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAnonSupabaseClient();
  const [lessons, series, categories, playlists, tags] = await Promise.all([
    loadPublishedLessons(supabase),
    loadRows(supabase.from('series').select('id, updated_at')),
    loadRows(supabase.from('categories').select('id, updated_at')),
    loadRows(supabase.from('playlists').select('id, updated_at').eq('is_public', true)),
    fetchTagCounts(supabase),
  ]);
  const entry = (pathname: string, row: Row) => ({ url: pageUrl(pathname), lastModified: row.updated_at });
  return [
    ...lessons.map((row) => entry(lessonPath(row.id), row)),
    ...series.map((row) => entry(seriesPath(row.id), row)),
    ...categories.map((row) => entry(categoryPath(row.id), row)),
    ...playlists.map((row) => entry(playlistPath(row.id), row)),
    ...tags.map(({ tag }) => ({ url: pageUrl(tagPath(tag)) })),
  ];
}

const getCachedCatalogEntries = unstable_cache(catalogEntries, ['sitemap', 'catalog'], {
  revalidate: 3600,
  tags: ['catalog'],
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings: MetadataRoute.Sitemap = LISTING_PATHS.map((pathname) => ({
    url: pageUrl(pathname),
    changeFrequency: 'daily',
  }));
  return [...listings, ...(await getCachedCatalogEntries())];
}
