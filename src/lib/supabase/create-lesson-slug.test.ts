import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertLessonWithSlug } from './create-lesson-slug';

const base = 'sukkot-25-09-2026';
const input = { date: '2026-09-25', parsha: 'סוכות' };
type Error = { code: string; message: string };
function fixture(
  options: { current?: string[]; history?: string[]; readError?: Error; insertErrors?: Array<Error | null> } = {},
) {
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      let row: Record<string, unknown> | undefined;
      const query = {
        select() {
          return this;
        },
        like() {
          return this;
        },
        order() {
          return this;
        },
        range() {
          return Promise.resolve({
            data: (table === 'lessons' ? options.current : options.history)?.map((slug) => ({ slug })) ?? [],
            error: options.readError ?? null,
          });
        },
        insert(value: Record<string, unknown>) {
          row = value;
          inserts.push(value);
          return this;
        },
        async single() {
          return { data: { id: 'created' }, error: row ? (options.insertErrors?.[inserts.length - 1] ?? null) : null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, inserts };
}

describe('insertLessonWithSlug', () => {
  it('adds the date and reading slug, keeping all upload fields', async () => {
    const { client, inserts } = fixture();
    const result = await insertLessonWithSlug(client, { title: 'שיעור', is_published: false }, input);
    expect(result.error).toBeNull();
    expect(inserts).toEqual([{ title: 'שיעור', is_published: false, slug: base }]);
  });
  it('reserves both current slugs and historical names', async () => {
    const { client, inserts } = fixture({ current: [base], history: [`${base}-2`] });
    await insertLessonWithSlug(client, { title: 'שיעור' }, input);
    expect(inserts[0].slug).toBe(`${base}-3`);
  });
  it('retries a 23505 slug race with the next suffix', async () => {
    const { client, inserts } = fixture({
      insertErrors: [{ code: '23505', message: 'duplicate key violates unique constraint "lessons_slug_key"' }, null],
    });
    await insertLessonWithSlug(client, { title: 'שיעור' }, input);
    expect(inserts.map((row) => row.slug)).toEqual([base, `${base}-2`]);
  });
  it('finishes the upload with its UUID after sustained slug contention', async () => {
    const race = { code: '23505', message: 'duplicate lessons_slug_key' };
    const { client, inserts } = fixture({ insertErrors: [...Array(20).fill(race), null] });
    const result = await insertLessonWithSlug(client, { title: 'שיעור' }, input);
    expect(result.error).toBeNull();
    expect(inserts).toHaveLength(21);
    expect(inserts.at(-1)).toEqual({ title: 'שיעור' });
  });
  it('leaves other unique-violation errors intact', async () => {
    const error = { code: '23505', message: 'duplicate lessons_pkey' };
    const { client, inserts } = fixture({ insertErrors: [error] });
    expect((await insertLessonWithSlug(client, {}, input)).error).toEqual(error);
    expect(inserts).toHaveLength(1);
  });
  it.each(['42703', 'PGRST204'])('creates without a slug when reads report missing column (%s)', async (code) => {
    const { client, inserts } = fixture({ readError: { code, message: 'column lessons.slug does not exist' } });
    await insertLessonWithSlug(client, { title: 'שיעור' }, input);
    expect(inserts).toEqual([{ title: 'שיעור' }]);
  });
  it('creates without slug when the insert reports undefined_column', async () => {
    const { client, inserts } = fixture({
      insertErrors: [{ code: '42703', message: 'column slug does not exist' }, null],
    });
    await insertLessonWithSlug(client, { title: 'שיעור' }, input);
    expect(inserts).toEqual([{ title: 'שיעור', slug: base }, { title: 'שיעור' }]);
  });
  it('does not insert after an unrelated failed reservation query', async () => {
    const { client, inserts } = fixture({ readError: { code: '08000', message: 'connection failed' } });
    await expect(insertLessonWithSlug(client, {}, input)).rejects.toMatchObject({ code: '08000' });
    expect(inserts).toEqual([]);
  });
  it('keeps the UUID route for an invalid date', async () => {
    const { client, inserts } = fixture();
    await insertLessonWithSlug(client, { title: 'שיעור' }, { date: 'unknown' });
    expect(inserts).toEqual([{ title: 'שיעור' }]);
  });
});
