import type { SupabaseClient } from '@supabase/supabase-js';
import { baseLessonSlug, uniqueLessonSlug, type LessonSlugInput } from '@/lib/lesson-slugs';
import { isMissingSlugSchema } from './lesson-route';

/** Reserve current and historical names. Page through PostgREST's bounded results. */
export async function takenLessonSlugs(client: SupabaseClient, base: string): Promise<Set<string>> {
  const taken = new Set<string>();
  for (const table of ['lessons', 'lesson_slug_history']) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client
        .from(table)
        .select('slug')
        .like('slug', `${base}%`)
        .order('slug')
        .range(offset, offset + 999);
      if (error) throw error;
      for (const row of data ?? []) if (row.slug) taken.add(row.slug);
      if (!data || data.length < 1000) break;
    }
  }
  return taken;
}

/** Only a slug uniqueness race warrants another insert. Other unique keys stay errors. */
function isSlugRace(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' && /lessons_slug_key/.test(error.message ?? '');
}

/** The upload still works before 020. Its caller owns authorization and publication. */
export async function insertLessonWithSlug(
  client: SupabaseClient,
  row: Record<string, unknown>,
  input: LessonSlugInput,
) {
  const insert = (slug?: string) =>
    client
      .from('lessons')
      .insert(slug ? { ...row, slug } : row)
      .select('id')
      .single();
  const base = baseLessonSlug(input);
  if (!base) return await insert();
  let taken: Set<string>;
  try {
    taken = await takenLessonSlugs(client, base);
  } catch (error) {
    if (isMissingSlugSchema(error as { code?: string; message?: string })) return await insert();
    throw error;
  }
  // Bounded retries protect an upload from an unexpected, sustained writer conflict.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = uniqueLessonSlug(base, (candidate) => taken.has(candidate));
    const result = await insert(slug);
    if (!result.error) return result;
    if (isMissingSlugSchema(result.error)) return await insert();
    if (!isSlugRace(result.error)) return result;
    taken.add(slug);
  }
  // Under sustained contention, finish the upload with its stable UUID URL.
  return await insert();
}
