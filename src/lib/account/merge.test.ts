import { describe, expect, it } from 'vitest';
import { applyServerProgress, mergeBookmarks, pickProgressToUpload, type ServerBookmark } from './merge';
import type { LocalBookmark } from '@/stores/bookmarks-store';

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
        { lesson_id: 'newer', position: 10, completed: false, last_played_at: at(10) },
        { lesson_id: 'older', position: 80, completed: false, last_played_at: at(20) },
      ],
    );
    expect(upload.map((entry) => entry.lessonId)).toEqual(['newer', 'missing']);
  });

  it('applies account progress that was played more recently than the device copy', () => {
    const merged = applyServerProgress(
      {
        keep: { lessonId: 'keep', position: 50, lastPlayed: at(30), completed: false },
        replace: { lessonId: 'replace', position: 5, lastPlayed: at(1), completed: false },
      },
      [
        { lesson_id: 'keep', position: 10, completed: true, last_played_at: at(10) },
        { lesson_id: 'replace', position: 80, completed: true, last_played_at: at(20) },
        { lesson_id: 'new', position: 3, completed: false, last_played_at: at(5) },
      ],
    );
    expect(merged.keep.position).toBe(50);
    expect(merged.replace).toEqual({ lessonId: 'replace', position: 80, lastPlayed: at(20), completed: true });
    expect(merged.new.position).toBe(3);
  });

  it('treats unparseable device timestamps as oldest', () => {
    const upload = pickProgressToUpload(
      [{ lessonId: 'x', position: 1, lastPlayed: 'garbage', completed: false }],
      [{ lesson_id: 'x', position: 2, completed: false, last_played_at: at(0) }],
    );
    expect(upload).toEqual([]);
  });
});
