import { describe, expect, it } from 'vitest';
import { getResumePoint } from '@/lib/lesson-progress';
import {
  applyServerProgress,
  isNoteDirty,
  mergeBookmarks,
  mergeNotes,
  pickProgressToUpload,
  selectNewerNotes,
  toNoteInput,
  type ServerBookmark,
  type ServerNote,
} from './merge';
import type { LocalBookmark } from '@/stores/bookmarks-store';
import type { LocalNote } from '@/stores/notes-store';

const local = (id: string, overrides: Partial<LocalBookmark> = {}): LocalBookmark => ({
  id,
  lessonId: 'lesson-1',
  position: 10.4,
  note: 'local note',
  tag: '',
  createdAt: '2026-09-01T10:00:00.000Z',
  ...overrides,
});

const server = (id: string, overrides: Partial<ServerBookmark> = {}): ServerBookmark => ({
  id,
  lesson_id: 'lesson-1',
  position: 10,
  note: 'server note',
  tag: 'important',
  audio_file_id: null,
  created_at: '2026-09-01T10:00:00.000Z',
  lesson: { title: 'Lesson', hebrew_title: 'שיעור' },
  ...overrides,
});

describe('mergeBookmarks', () => {
  it('keeps local-only bookmarks, adds account-only ones and never duplicates', () => {
    const merged = mergeBookmarks([local('a'), local('b')], [server('b'), server('c')], []);
    expect(merged.map((b) => b.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('lets the account copy win for bookmarks both sides know, keeping precise local seconds', () => {
    const [merged] = mergeBookmarks([local('b', { position: 10.4 })], [server('b', { position: 10 })], []);
    expect(merged.note).toBe('server note');
    expect(merged.tag).toBe('important');
    expect(merged.position).toBe(10.4);
    expect(merged.lessonTitle).toBe('שיעור');
  });

  it('uses the account position when it moved to another second', () => {
    const [merged] = mergeBookmarks([local('b', { position: 10.4 })], [server('b', { position: 95 })], []);
    expect(merged.position).toBe(95);
  });

  it('never resurrects bookmarks deleted on this device', () => {
    const merged = mergeBookmarks([local('a')], [server('a'), server('gone')], ['gone', 'a']);
    expect(merged).toEqual([]);
  });
});

describe('progress sync', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 10, minute)).toISOString();

  it('uploads only device entries newer than (or missing from) the account', () => {
    const upload = pickProgressToUpload(
      [
        { lessonId: 'newer', position: 50, lastPlayed: at(30), completed: false },
        { lessonId: 'older', position: 5, lastPlayed: at(1), completed: false },
        { lessonId: 'missing', position: 7, lastPlayed: at(2), completed: true },
      ],
      [
        { lesson_id: 'newer', audio_file_id: null, position: 10, completed: false, last_played_at: at(10) },
        { lesson_id: 'older', audio_file_id: null, position: 80, completed: false, last_played_at: at(20) },
      ],
    );
    expect(upload.map((entry) => entry.lessonId)).toEqual(['newer', 'missing']);
  });

  it('applies account progress (including its part) that was played more recently than the device copy', () => {
    const merged = applyServerProgress(
      {
        keep: { lessonId: 'keep', position: 50, lastPlayed: at(30), completed: false },
        replace: { lessonId: 'replace', position: 5, lastPlayed: at(1), completed: false },
      },
      [
        { lesson_id: 'keep', audio_file_id: null, position: 10, completed: true, last_played_at: at(10) },
        { lesson_id: 'replace', audio_file_id: 'part-2', position: 80, completed: false, last_played_at: at(20) },
        { lesson_id: 'new', audio_file_id: null, position: 3, completed: false, last_played_at: at(5) },
      ],
    );
    expect(merged.keep.position).toBe(50);
    expect(merged.replace).toEqual({
      lessonId: 'replace',
      audioFileId: 'part-2',
      position: 80,
      lastPlayed: at(20),
      completed: false,
    });
    expect(merged.new.position).toBe(3);
  });

  it('keeps an observed file duration only when newer account progress is for that same file', () => {
    const merged = applyServerProgress(
      {
        same: { lessonId: 'same', audioFileId: 'part-1', position: 300, duration: 600, completed: false, lastPlayed: at(1) },
        changed: { lessonId: 'changed', audioFileId: 'part-1', position: 300, duration: 600, completed: false, lastPlayed: at(1) },
      },
      [
        { lesson_id: 'same', audio_file_id: 'part-1', position: 600, completed: false, last_played_at: at(20) },
        { lesson_id: 'changed', audio_file_id: 'part-2', position: 200, completed: false, last_played_at: at(20) },
      ],
    );
    expect(getResumePoint([{ audioFileId: 'part-1', duration: 0 }, { audioFileId: 'part-2', duration: 900 }], merged.same)).toEqual({
      index: 1,
      position: 0,
    });
    expect(merged.changed.duration).toBeUndefined();
  });

  it('treats unparseable device timestamps as oldest', () => {
    const upload = pickProgressToUpload(
      [{ lessonId: 'x', position: 1, lastPlayed: 'garbage', completed: false }],
      [{ lesson_id: 'x', audio_file_id: null, position: 2, completed: false, last_played_at: at(0) }],
    );
    expect(upload).toEqual([]);
  });
});

describe('notes sync', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 10, minute)).toISOString();
  // PostgREST renders timestamptz with an offset instead of `Z`.
  const pg = (minute: number) => at(minute).replace('.000Z', '+00:00');

  const note = (id: string, overrides: Partial<LocalNote> = {}): LocalNote => ({
    id,
    lessonId: 'lesson-1',
    body: `local ${id}`,
    position: 12.5,
    audioFileId: null,
    createdAt: at(0),
    updatedAt: at(0),
    syncedAt: null,
    images: [],
    ...overrides,
  });

  const row = (id: string, overrides: Partial<ServerNote> = {}): ServerNote => ({
    id,
    lesson_id: 'lesson-1',
    audio_file_id: null,
    position_seconds: 12.5,
    body: `server ${id}`,
    created_at: pg(0),
    updated_at: pg(0),
    lesson: { title: 'Lesson', hebrew_title: 'שיעור' },
    images: [],
    ...overrides,
  });

  /** What the account holds after syncNotes stored `uploads` (server-side last-write-wins). */
  const storeInAccount = (account: ServerNote[], uploads: LocalNote[]): ServerNote[] => {
    const accepted = selectNewerNotes(uploads.map(toNoteInput), account);
    const rest = account.filter((r) => !accepted.some((n) => n.id === r.id));
    return [...rest, ...accepted.map((n) => row(n.id, { ...n, lesson: null }))];
  };

  it('merges device notes into the account idempotently: a second sync uploads and changes nothing', () => {
    const device = [note('a'), note('b', { updatedAt: at(5) })];
    let account = [row('c')];

    const firstUploads = device.filter(isNoteDirty);
    account = storeInAccount(account, firstUploads);
    const afterFirst = mergeNotes(device, account, [], device);
    expect(afterFirst.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(afterFirst.every((n) => !isNoteDirty(n))).toBe(true);

    const secondUploads = afterFirst.filter(isNoteDirty);
    expect(secondUploads).toEqual([]);
    const afterSecond = mergeNotes(afterFirst, storeInAccount(account, secondUploads), [], afterFirst);
    expect(afterSecond).toEqual(afterFirst);
  });

  it('keeps the newer edit on either side and takes images from the account', () => {
    const image = { id: 'img', content_type: 'image/webp', width: 10, height: 20, created_at: pg(1) };
    const merged = mergeNotes(
      [
        note('local-newer', { body: 'edited here', updatedAt: at(9), syncedAt: pg(3) }),
        note('server-newer', { body: 'stale', updatedAt: at(3), syncedAt: pg(3) }),
      ],
      [
        row('local-newer', { body: 'old', updated_at: pg(3), images: [image] }),
        row('server-newer', { body: 'edited elsewhere', updated_at: pg(7) }),
      ],
      [],
      [],
    );
    const byId = Object.fromEntries(merged.map((n) => [n.id, n]));
    expect(byId['local-newer'].body).toBe('edited here');
    expect(byId['local-newer'].images).toEqual([{ id: 'img', width: 10, height: 20 }]);
    expect(isNoteDirty(byId['local-newer'])).toBe(true);
    expect(byId['server-newer'].body).toBe('edited elsewhere');
    expect(isNoteDirty(byId['server-newer'])).toBe(false);
  });

  it('never resurrects notes deleted on this device', () => {
    const merged = mergeNotes([note('kept')], [row('kept'), row('deleted')], ['deleted', 'kept'], []);
    expect(merged).toEqual([]);
  });

  it('drops clean copies of notes deleted on another device, but keeps unsynced and edited ones', () => {
    const sent = [
      note('deleted-elsewhere', { syncedAt: pg(0) }),
      note('edited-here', { updatedAt: at(4), syncedAt: pg(0) }),
      note('never-synced'),
    ];
    const merged = mergeNotes([...sent, note('created-during-sync', { syncedAt: pg(6), updatedAt: at(6) })], [], [], sent);
    expect(merged.map((n) => n.id)).toEqual(['edited-here', 'never-synced', 'created-during-sync']);
  });

  it('does not let an older device copy overwrite a newer account version', () => {
    const uploads = [toNoteInput(note('x', { updatedAt: at(2) })), toNoteInput(note('y', { updatedAt: at(8) }))];
    const accepted = selectNewerNotes(uploads, [
      { id: 'x', updated_at: pg(5) },
      { id: 'y', updated_at: pg(5) },
    ]);
    expect(accepted.map((n) => n.id)).toEqual(['y']);
  });
});
