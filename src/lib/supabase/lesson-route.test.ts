import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lessonRedirectUrl, resolveLessonRoute } from './lesson-route';

const id = 'fb296bdf-9d25-4832-a2d9-262875d48a29';
const slug = 'sukkot-25-09-2026';
function client(
  lessons: Array<{ id: string; slug?: string | null }>,
  history: Record<string, string> = {},
  error: unknown = null,
) {
  return {
    from(table: string) {
      let column = '';
      let value = '';
      return {
        select() {
          return this;
        },
        eq(key: string, match: string) {
          column = key;
          value = match;
          return this;
        },
        async maybeSingle() {
          const data =
            table === 'lessons'
              ? (lessons.find((lesson) => lesson[column as 'id' | 'slug']?.toLowerCase() === value.toLowerCase()) ??
                null)
              : history[value]
                ? { lesson_id: history[value] }
                : null;
          return { data, error };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('resolveLessonRoute', () => {
  it.each([null, undefined])('keeps a UUID lesson without slug (%s)', async (empty) => {
    expect(await resolveLessonRoute(client([{ id, slug: empty }]), id)).toEqual({ kind: 'lesson', lessonId: id });
  });
  it('redirects a UUID to its current slug', async () => {
    expect(await resolveLessonRoute(client([{ id, slug }]), id)).toEqual({
      kind: 'redirect',
      lessonId: id,
      pathname: `/lessons/${slug}`,
    });
  });
  it('renders a current slug, before checking history', async () => {
    expect(await resolveLessonRoute(client([{ id, slug }], { [slug]: 'different' }), slug)).toEqual({
      kind: 'lesson',
      lessonId: id,
    });
  });
  it('redirects a historical slug to the current slug', async () => {
    expect(await resolveLessonRoute(client([{ id, slug }], { old: id }), 'old')).toEqual({
      kind: 'redirect',
      lessonId: id,
      pathname: `/lessons/${slug}`,
    });
  });
  it('redirects history to UUID when the current lesson has no slug', async () => {
    expect(await resolveLessonRoute(client([{ id, slug: null }], { old: id }), 'old')).toEqual({
      kind: 'redirect',
      lessonId: id,
      pathname: `/lessons/${id}`,
    });
  });
  it('normalizes uppercase slugs with a redirect', async () => {
    expect(await resolveLessonRoute(client([{ id, slug }]), slug.toUpperCase())).toMatchObject({
      kind: 'redirect',
      pathname: `/lessons/${slug}`,
    });
  });
  it('accepts encoded slugs and UUIDs', async () => {
    expect(await resolveLessonRoute(client([{ id, slug }]), '%73ukkot-25-09-2026')).toEqual({
      kind: 'lesson',
      lessonId: id,
    });
    expect(await resolveLessonRoute(client([{ id }]), id.replace('f', '%66'))).toEqual({
      kind: 'lesson',
      lessonId: id,
    });
  });
  it.each(['unknown', 'bad%XX', '../admin', 'a--b', 'a/b', ''])('returns not-found for %s', async (param) => {
    expect(await resolveLessonRoute(client([{ id, slug }]), param)).toEqual({ kind: 'not-found' });
  });
  it('returns not-found for a UUID not present or hidden by RLS', async () => {
    expect(await resolveLessonRoute(client([]), id)).toEqual({ kind: 'not-found' });
  });
  it('returns not-found for an old name whose lesson is no longer readable', async () => {
    expect(await resolveLessonRoute(client([], { old: id }), 'old')).toEqual({ kind: 'not-found' });
  });
  it('unknown slug is not a server error before migration 020', async () => {
    expect(
      await resolveLessonRoute(
        client([], {}, { code: '42703', message: 'column lessons.slug does not exist' }),
        'unknown',
      ),
    ).toEqual({ kind: 'not-found' });
  });
  it('does not hide unrelated database failures at its interface', async () => {
    await expect(resolveLessonRoute(client([], {}, { code: '08000' }), id)).rejects.toMatchObject({ code: '08000' });
  });
});

describe('lessonRedirectUrl', () => {
  it.each(['he', 'en'] as const)('preserves locale %s and all query values', (locale) => {
    const result = new URL(
      lessonRedirectUrl(`/lessons/${slug}`, locale, {
        t: '123',
        file: 'part',
        extra: ['one', 'two'],
        empty: '',
        omitted: undefined,
      }),
      'https://example.test',
    );
    expect(result.pathname).toBe(`/${locale}/lessons/${slug}`);
    expect([...result.searchParams]).toEqual([
      ['t', '123'],
      ['file', 'part'],
      ['extra', 'one'],
      ['extra', 'two'],
      ['empty', ''],
    ]);
  });
  it('does not append an empty question mark', () => {
    expect(lessonRedirectUrl(`/lessons/${id}`, 'en')).toBe(`/en/lessons/${id}`);
  });
});
