import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Bookmark server actions against a recording fake of the Supabase builder.
 * Each `await` on a query pops the next scripted result.
 */

const db = vi.hoisted(() => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const results: Array<{ data: unknown; error: { code?: string; message?: string } | null }> = [];
  const query: Record<string, unknown> = {};
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    });
  Object.assign(query, {
    update: record('update'),
    upsert: record('upsert'),
    select: record('select'),
    eq: record('eq'),
    order: record('order'),
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      const next = results.shift() ?? { data: [], error: null };
      return Promise.resolve(next).then(resolve, reject);
    },
  });
  const client = {
    from: vi.fn((table: string) => {
      calls.push({ method: 'from', args: [table] });
      return query;
    }),
  };
  return { calls, results, client };
});

vi.mock('@/lib/account/server', () => ({
  ID_CHUNK: 100,
  getSignedInClient: vi.fn(async () => ({ supabase: db.client, userId: 'user-1' })),
  filterVisibleIds: vi.fn(async () => new Set<string>()),
}));

import { createBookmark, syncBookmarks, updateBookmark } from './bookmarks';

const BOOKMARK = '11111111-2222-3333-4444-555555555555';
const LESSON = '66666666-7777-8888-9999-000000000000';
const OLD = '2026-09-01T10:00:00.000000+00:00';
const NEW = '2026-09-02T10:00:00.000000+00:00';
const MISSING_COLUMN = { code: '42703', message: 'column bookmarks.updated_at does not exist' };

const callsTo = (method: string) => db.calls.filter((call) => call.method === method);
const eqFilters = () => callsTo('eq').map((call) => call.args as [string, unknown]);

beforeEach(() => {
  db.calls.length = 0;
  db.results.length = 0;
  db.client.from.mockClear();
});

describe('updateBookmark (server action)', () => {
  it('edits note and tag only, scoped to the session user and the version the editor saw', async () => {
    db.results.push({ data: [{ id: BOOKMARK, updated_at: NEW }], error: null });

    const result = await updateBookmark(BOOKMARK, { note: 'שלום', tag: 'quote' }, OLD);

    expect(result).toEqual({ updatedAt: NEW });
    expect(eqFilters()).toEqual(
      expect.arrayContaining([
        ['id', BOOKMARK],
        ['user_id', 'user-1'],
        ['updated_at', OLD],
      ]),
    );
    expect(callsTo('update')[0].args[0]).toEqual({ note: 'שלום', tag: 'quote' });
    expect(callsTo('select')[0].args[0]).toBe('id, updated_at');
  });

  it('never writes the lesson, part, position or id, so the bookmark keeps its association', async () => {
    db.results.push({ data: [{ id: BOOKMARK, updated_at: NEW }], error: null });

    await updateBookmark(BOOKMARK, { note: 'x' }, null);

    const patch = callsTo('update')[0].args[0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(['note']);
  });

  it('filters by the session user even when the caller sends another user', async () => {
    db.results.push({ data: [{ id: BOOKMARK, updated_at: NEW }], error: null });

    await updateBookmark(BOOKMARK, { note: 'x', user_id: 'someone-else' } as never, null);

    expect(eqFilters()).toContainEqual(['user_id', 'user-1']);
    expect(eqFilters()).not.toContainEqual(['user_id', 'someone-else']);
  });

  it('reports a stale edit as changed_elsewhere when the row no longer has the expected version', async () => {
    db.results.push({ data: [], error: null });

    const result = await updateBookmark(BOOKMARK, { note: 'mine' }, OLD);

    expect(result).toEqual({ error: 'changed_elsewhere' });
  });

  it('reports 0 rows without an expected version as not_uploaded (the account never had it)', async () => {
    db.results.push({ data: [], error: null });

    const result = await updateBookmark(BOOKMARK, { note: 'mine' }, null);

    expect(result).toEqual({ error: 'not_uploaded' });
    expect(eqFilters()).not.toContainEqual(['updated_at', expect.anything()]);
  });

  it('falls back to an unconditional update by id + user before migration 024', async () => {
    db.results.push({ data: null, error: MISSING_COLUMN }, { data: [{ id: BOOKMARK }], error: null });

    const result = await updateBookmark(BOOKMARK, { note: 'after migration missing' }, OLD);

    expect(result).toEqual({ updatedAt: null });
    expect(callsTo('update')).toHaveLength(2);
    expect(eqFilters().filter(([column]) => column === 'updated_at')).toHaveLength(1);
    expect(callsTo('select')[1].args[0]).toBe('id');
    expect(eqFilters()).toEqual(
      expect.arrayContaining([
        ['id', BOOKMARK],
        ['user_id', 'user-1'],
      ]),
    );
  });

  it('rejects an oversized expected version without touching the database', async () => {
    const result = await updateBookmark(BOOKMARK, { note: 'x' }, 'x'.repeat(65));

    expect(result).toEqual({ error: 'invalid_bookmark' });
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('rejects a note over the length limit', async () => {
    const result = await updateBookmark(BOOKMARK, { note: 'x'.repeat(2001) }, null);

    expect(result).toEqual({ error: 'invalid_bookmark' });
    expect(db.client.from).not.toHaveBeenCalled();
  });
});

describe('createBookmark (server action)', () => {
  const row = { id: BOOKMARK, lesson_id: LESSON, position: 95, note: 'n', tag: 'important', audio_file_id: null };

  it('returns the server updated_at so the device can compare later edits', async () => {
    db.results.push({ data: [{ updated_at: NEW }], error: null });

    expect(await createBookmark(row)).toEqual({ updatedAt: NEW });
    expect(callsTo('select')[0].args[0]).toBe('updated_at');
  });

  it('still creates the bookmark before migration 024', async () => {
    db.results.push({ data: null, error: MISSING_COLUMN }, { data: [{ id: BOOKMARK }], error: null });

    expect(await createBookmark(row)).toEqual({ updatedAt: null });
    expect(callsTo('upsert')).toHaveLength(2);
  });
});

describe('syncBookmarks select', () => {
  it('reads updated_at when it exists', async () => {
    db.results.push({ data: [], error: null });

    await syncBookmarks({ bookmarks: [], deletedIds: [] });

    expect(callsTo('select')[0].args[0]).toMatch(/, updated_at$/);
  });

  it('keeps syncing before migration 024 by dropping only updated_at from the select', async () => {
    db.results.push({ data: null, error: MISSING_COLUMN }, { data: [{ id: BOOKMARK }], error: null });

    const result = await syncBookmarks({ bookmarks: [], deletedIds: [] });

    expect(result).toEqual({ data: [{ id: BOOKMARK }] });
    expect(callsTo('select')[1].args[0]).not.toMatch(/updated_at/);
  });
});
