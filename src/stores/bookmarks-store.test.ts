import { beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  createBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  updateBookmark: vi.fn(),
}));
vi.mock('@/actions/bookmarks', () => actions);

// The node test environment has no localStorage; the persisted store needs one.
vi.hoisted(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  });
});

import { useBookmarksStore, type LocalBookmark } from './bookmarks-store';

const BOOKMARK = '11111111-2222-3333-4444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const LESSON = '66666666-7777-8888-9999-000000000000';
const PART = '12121212-3434-5656-7878-909090909090';
const OLD = '2026-09-01T10:00:00.000000+00:00';
const NEW = '2026-09-02T10:00:00.000000+00:00';

const base: LocalBookmark = {
  id: BOOKMARK,
  lessonId: LESSON,
  position: 95,
  note: 'before',
  tag: 'review',
  createdAt: '2026-09-01T09:00:00.000Z',
  lessonTitle: 'שיעור',
  audioFileId: PART,
  updatedAt: OLD,
};
const other: LocalBookmark = { ...base, id: OTHER, note: 'other', position: 10 };

const bookmarkById = (id: string) => useBookmarksStore.getState().bookmarks.find((b) => b.id === id);

beforeEach(() => {
  vi.clearAllMocks();
  useBookmarksStore.setState({ bookmarks: [base, other], pendingDeletes: [], accountUserId: null });
});

describe('updateBookmark (signed out, local only)', () => {
  it('edits in place: same id, lesson, position and part, same number of bookmarks', async () => {
    const result = await useBookmarksStore.getState().updateBookmark(
      BOOKMARK,
      { note: 'after', tag: 'quote' },
      {
        expectedUpdatedAt: OLD,
      },
    );

    expect(result).toEqual({});
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(2);
    expect(bookmarkById(BOOKMARK)).toEqual({ ...base, note: 'after', tag: 'quote' });
    expect(actions.updateBookmark).not.toHaveBeenCalled();
  });

  it('refuses when the bookmark is no longer the version the editor opened', async () => {
    const before = useBookmarksStore.getState().bookmarks;

    const result = await useBookmarksStore.getState().updateBookmark(
      BOOKMARK,
      { note: 'mine' },
      {
        expectedUpdatedAt: '2026-08-01T00:00:00.000000+00:00',
      },
    );

    expect(result).toEqual({ error: 'changed_elsewhere' });
    expect(useBookmarksStore.getState().bookmarks).toBe(before);
  });

  it('refuses an unknown bookmark instead of creating one', async () => {
    const result = await useBookmarksStore.getState().updateBookmark('missing-id', { note: 'x' });

    expect(result).toEqual({ error: 'changed_elsewhere' });
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(2);
  });
});

describe('updateBookmark (signed in)', () => {
  beforeEach(() => {
    useBookmarksStore.setState({ accountUserId: 'user-1' });
  });

  it('sends the expected version to the account and takes the server updated_at', async () => {
    actions.updateBookmark.mockResolvedValue({ updatedAt: NEW });

    const result = await useBookmarksStore.getState().updateBookmark(
      BOOKMARK,
      { note: 'after' },
      {
        expectedUpdatedAt: OLD,
      },
    );

    expect(result).toEqual({});
    expect(actions.updateBookmark).toHaveBeenCalledWith(BOOKMARK, { note: 'after' }, OLD);
    expect(bookmarkById(BOOKMARK)).toMatchObject({
      id: BOOKMARK,
      lessonId: LESSON,
      position: 95,
      note: 'after',
      updatedAt: NEW,
    });
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(2);
  });

  it('leaves the device copy untouched when another device changed the bookmark', async () => {
    actions.updateBookmark.mockResolvedValue({ error: 'changed_elsewhere' });
    const before = useBookmarksStore.getState().bookmarks;

    const result = await useBookmarksStore.getState().updateBookmark(
      BOOKMARK,
      { note: 'mine' },
      {
        expectedUpdatedAt: OLD,
      },
    );

    expect(result).toEqual({ error: 'changed_elsewhere' });
    expect(useBookmarksStore.getState().bookmarks).toBe(before);
    expect(bookmarkById(BOOKMARK)).toEqual(base);
  });

  it('keeps the edit on the device as sync_failed when the bookmark never reached the account', async () => {
    actions.updateBookmark.mockResolvedValue({ error: 'not_uploaded' });

    const result = await useBookmarksStore.getState().updateBookmark(
      BOOKMARK,
      { note: 'offline edit' },
      {
        expectedUpdatedAt: null,
      },
    );

    expect(result).toEqual({ error: 'sync_failed' });
    expect(bookmarkById(BOOKMARK)).toEqual({ ...base, note: 'offline edit' });
  });

  it('reports save_failed and changes nothing when the account call throws', async () => {
    actions.updateBookmark.mockRejectedValue(new Error('network down'));
    const before = useBookmarksStore.getState().bookmarks;

    const result = await useBookmarksStore.getState().updateBookmark(
      BOOKMARK,
      { note: 'mine' },
      {
        expectedUpdatedAt: OLD,
      },
    );

    expect(result).toEqual({ error: 'save_failed' });
    expect(useBookmarksStore.getState().bookmarks).toBe(before);
  });

  it('reports save_failed and changes nothing when the account refuses the write', async () => {
    actions.updateBookmark.mockResolvedValue({ error: 'permission denied' });
    const before = useBookmarksStore.getState().bookmarks;

    const result = await useBookmarksStore.getState().updateBookmark(
      BOOKMARK,
      { note: 'mine' },
      {
        expectedUpdatedAt: OLD,
      },
    );

    expect(result).toEqual({ error: 'save_failed' });
    expect(useBookmarksStore.getState().bookmarks).toBe(before);
  });
});

describe('addBookmark', () => {
  it('takes the server updated_at for a bookmark created while signed in', async () => {
    useBookmarksStore.setState({ accountUserId: 'user-1' });
    actions.createBookmark.mockResolvedValue({ updatedAt: NEW });

    await useBookmarksStore.getState().addBookmark(LESSON, 30, 'note', 'important', { audioFileId: PART });

    const created = useBookmarksStore.getState().bookmarks.find((b) => b.position === 30);
    expect(created).toMatchObject({ lessonId: LESSON, note: 'note', audioFileId: PART, updatedAt: NEW });
    expect(useBookmarksStore.getState().bookmarks).toHaveLength(3);
  });

  it('keeps the device copy unconfirmed when the account create fails', async () => {
    useBookmarksStore.setState({ accountUserId: 'user-1' });
    actions.createBookmark.mockResolvedValue({ error: 'network down' });

    const result = await useBookmarksStore.getState().addBookmark(LESSON, 30, 'note', 'important');

    expect(result).toEqual({ error: 'sync_failed' });
    const created = useBookmarksStore.getState().bookmarks.find((b) => b.position === 30);
    expect(created?.updatedAt).toBeUndefined();
  });
});
