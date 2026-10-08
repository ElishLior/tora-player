import type { SupabaseClient } from '@supabase/supabase-js';
import { lessonPath, localePath, type SiteLocale } from '@/config/site';
import { isUuid, isValidLessonSlug } from '@/lib/lesson-slugs';

export type LessonRoute =
  | { kind: 'lesson'; lessonId: string }
  | { kind: 'redirect'; lessonId: string; pathname: string }
  | { kind: 'not-found' };

export type LessonSearchParams = Record<string, string | string[] | undefined>;

/** Next can pass an encoded segment. Malformed escapes stay unknown routes. */
export function decodeLessonParam(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

/** Preserve repeated and unrelated query parameters, including playback time/file. */
export function lessonRedirectUrl(pathname: string, locale: SiteLocale, searchParams: LessonSearchParams = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  return `${localePath(pathname, locale)}${query.size ? `?${query}` : ''}`;
}

/** The caller supplies lessonReadClient for drafts, or an anon client for public previews. */
export async function resolveLessonRoute(supabase: SupabaseClient, param: string): Promise<LessonRoute> {
  const decoded = decodeLessonParam(param);
  const uuid = isUuid(decoded);
  const normalized = decoded.toLowerCase();
  if (!uuid && !isValidLessonSlug(normalized)) return { kind: 'not-found' };

  // `*` also works before migration 020; old UUID links must never need the new column.
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq(uuid ? 'id' : 'slug', uuid ? decoded : normalized)
    .maybeSingle();
  if (error) {
    if (!uuid && isMissingSlugSchema(error)) return { kind: 'not-found' };
    throw error;
  }
  if (data) {
    const lesson = data as { id: string; slug?: string | null };
    if (lesson.slug && decoded !== lesson.slug) {
      return { kind: 'redirect', lessonId: lesson.id, pathname: lessonPath(lesson) };
    }
    return { kind: 'lesson', lessonId: lesson.id };
  }
  if (uuid) return { kind: 'not-found' };

  const history = await supabase.from('lesson_slug_history').select('lesson_id').eq('slug', normalized).maybeSingle();
  if (history.error) {
    if (isMissingSlugSchema(history.error)) return { kind: 'not-found' };
    throw history.error;
  }
  if (!history.data) return { kind: 'not-found' };
  const current = await supabase.from('lessons').select('*').eq('id', history.data.lesson_id).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) return { kind: 'not-found' };
  return { kind: 'redirect', lessonId: current.data.id, pathname: lessonPath(current.data) };
}

/** Postgres or PostgREST schema-cache errors during the additive migration rollout. */
export function isMissingSlugSchema(error: { code?: string; message?: string }): boolean {
  return (
    ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '') &&
    /slug|lesson_slug_history/i.test(error.message ?? '')
  );
}
