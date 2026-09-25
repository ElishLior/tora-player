import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOfflineLessonTracks } from './lesson-tracks';
import { isLastPart } from './lesson-progress';

const dbState = vi.hoisted(() => ({
  stores: new Map<string, Map<IDBValidKey, unknown>>(),
  putError: null as Error | null,
}));

vi.mock('idb', () => ({
  openDB: vi.fn(async (_name: string, _version: number, options?: { upgrade?: (db: unknown) => void }) => {
    const db = {
      objectStoreNames: {
        contains: (storeName: string) => dbState.stores.has(storeName),
      },
      createObjectStore: (storeName: string) => {
        if (!dbState.stores.has(storeName)) {
          dbState.stores.set(storeName, new Map());
        }
      },
      get: async (storeName: string, key: IDBValidKey) => dbState.stores.get(storeName)?.get(key),
      getAll: async (storeName: string) => Array.from(dbState.stores.get(storeName)?.values() ?? []),
      put: async (storeName: string, value: unknown, key?: IDBValidKey) => {
        const store = dbState.stores.get(storeName);
        if (!store) throw new Error(`Missing store ${storeName}`);
        if (dbState.putError) throw dbState.putError;
        const storedKey = key ?? (value as { lessonId?: IDBValidKey }).lessonId;
        if (!storedKey) throw new Error('Missing key');
        store.set(storedKey, value);
      },
      delete: async (storeName: string, key: IDBValidKey) => {
        dbState.stores.get(storeName)?.delete(key);
      },
    };

    options?.upgrade?.(db);
    return db;
  }),
}));

async function loadOfflineStorage() {
  vi.resetModules();
  return import('./offline-storage');
}

function mockAudioFetch(failSecondFile = false) {
  const fetchMock = vi.fn(async (url: string) => {
    if (failSecondFile && url.includes('part-2')) {
      return new Response('failed', { status: 500 });
    }

    const body = url.includes('part-2') ? 'second-file' : 'first';
    return new Response(body, {
      status: 200,
      headers: {
        'content-length': String(body.length),
        'content-type': 'audio/mpeg',
      },
    });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  dbState.stores.clear();
  dbState.putError = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let blobCounter = 0;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => `blob:audio-${++blobCounter}-${blob.size}`),
      revokeObjectURL: vi.fn(),
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('offline lesson storage', () => {
  it('stores multi-file lesson audio under separate offline keys and resolves by audio url', async () => {
    mockAudioFetch();
    const progress: number[] = [];
    const {
      saveAudioFilesOffline,
      getDownloadedLessons,
      getOfflineAudioUrl,
      isLessonDownloaded,
    } = await loadOfflineStorage();

    const result = await saveAudioFilesOffline(
      'lesson-1',
      [
        {
          audioFileId: 'audio-1',
          audioUrl: '/api/audio/stream/part-1.mp3',
          title: 'Part 1',
          duration: 10,
          sortOrder: 0,
        },
        {
          audioFileId: 'audio-2',
          audioUrl: '/api/audio/stream/part-2.mp3',
          title: 'Part 2',
          duration: 20,
          sortOrder: 1,
        },
      ],
      {
        lessonId: 'lesson-1',
        title: 'Lesson',
        hebrewTitle: 'שיעור',
        duration: 30,
        date: '2026-05-10',
        seriesName: 'Series',
      },
      (percent) => progress.push(percent)
    );

    expect(result).toEqual({ ok: true });
    expect(await isLessonDownloaded('lesson-1')).toBe(true);

    const [lesson] = await getDownloadedLessons();
    expect(lesson.audioFiles).toHaveLength(2);
    expect(lesson.audioFiles.map((file) => file.offlineKey)).toEqual([
      'lesson-1:audio-1',
      'lesson-1:audio-2',
    ]);
    expect(lesson.fileSize).toBe('first'.length + 'second-file'.length);
    expect(progress.at(-1)).toBe(100);

    const partOneUrl = await getOfflineAudioUrl('lesson-1', '/api/audio/stream/part-1.mp3');
    const partTwoUrl = await getOfflineAudioUrl('lesson-1', '/api/audio/stream/part-2.mp3');

    expect(partOneUrl).toMatch(/^blob:audio-/);
    expect(partTwoUrl).toMatch(/^blob:audio-/);
    expect(partOneUrl).not.toEqual(partTwoUrl);
  });

  it('does not resolve an unmatched requested url to the only cached secondary file', async () => {
    mockAudioFetch();
    const { saveAudioFilesOffline, getOfflineAudioUrl } = await loadOfflineStorage();

    const result = await saveAudioFilesOffline(
      'lesson-secondary-only',
      [
        {
          audioFileId: 'audio-2',
          audioUrl: '/api/audio/stream/part-2.mp3',
          title: 'Part 2',
          duration: 20,
          sortOrder: 1,
        },
      ],
      {
        lessonId: 'lesson-secondary-only',
        title: 'Lesson',
        hebrewTitle: 'שיעור',
        duration: 30,
        date: '2026-05-10',
        audioUrl: '/api/audio/stream/part-1.mp3',
      }
    );

    expect(result).toEqual({ ok: true });
    expect(await getOfflineAudioUrl('lesson-secondary-only', '/api/audio/stream/part-1.mp3')).toBeNull();
    expect(await getOfflineAudioUrl('lesson-secondary-only', '/api/audio/stream/part-2.mp3')).toMatch(/^blob:audio-/);
    expect(await getOfflineAudioUrl('lesson-secondary-only')).toMatch(/^blob:audio-/);
  });

  it('keeps original lesson positions when only the first or last part is saved', async () => {
    mockAudioFetch();
    const { saveAudioFilesOffline, getDownloadedLesson } = await loadOfflineStorage();
    const meta = {
      lessonId: 'partial-lesson',
      title: 'Lesson',
      hebrewTitle: 'שיעור',
      duration: 1800,
      date: '2026-05-10',
    };

    await saveAudioFilesOffline('partial-lesson', [{
      audioFileId: 'first',
      audioUrl: '/api/audio/stream/part-1.mp3',
      duration: 0,
      partIndex: 0,
      partCount: 3,
      sortOrder: 10,
    }], meta);
    const first = await getDownloadedLesson('partial-lesson');
    expect(first?.audioFiles[0]).toMatchObject({ audioFileId: 'first', partIndex: 0, partCount: 3 });
    const firstTrack = getOfflineLessonTracks(first!)[0];
    expect(firstTrack).toMatchObject({ partIndex: 0, partCount: 3, duration: 0 });
    expect(isLastPart(firstTrack)).toBe(false);

    await saveAudioFilesOffline('partial-lesson', [{
      audioFileId: 'third',
      audioUrl: '/api/audio/stream/part-3.mp3',
      duration: 300,
      partIndex: 2,
      partCount: 3,
      sortOrder: 30,
    }], meta);
    const both = await getDownloadedLesson('partial-lesson');
    expect(getOfflineLessonTracks(both!).map(({ audioFileId, partIndex, partCount }) => ({
      audioFileId, partIndex, partCount,
    }))).toEqual([
      { audioFileId: 'first', partIndex: 0, partCount: 3 },
      { audioFileId: 'third', partIndex: 2, partCount: 3 },
    ]);
    expect(isLastPart(getOfflineLessonTracks(both!)[1])).toBe(true);

    await saveAudioFilesOffline('last-only', [{
      audioFileId: 'third',
      audioUrl: '/api/audio/stream/part-3.mp3',
      partIndex: 2,
      partCount: 3,
    }], { ...meta, lessonId: 'last-only' });
    expect(getOfflineLessonTracks((await getDownloadedLesson('last-only'))!)[0]).toMatchObject({
      partIndex: 2, partCount: 3,
    });
  });

  it('does not infer completion from the saved subset of older audio-file metadata', async () => {
    const { getDownloadedLesson } = await loadOfflineStorage();
    await getDownloadedLesson('initialize-db');
    const stored = {
      lessonId: 'older',
      title: 'Older lesson',
      hebrewTitle: 'שיעור',
      audioUrl: '/old.mp3',
      duration: 1800,
      date: '2026-05-10',
      audioFiles: [{
        offlineKey: 'older:part',
        lessonId: 'older',
        audioFileId: 'part',
        audioUrl: '/old.mp3',
        duration: 0,
        sortOrder: 4,
      }],
    };
    dbState.stores.get('lesson-meta')!.set('older', stored);
    dbState.stores.get('audio-cache')!.set('older:part', new Blob(['audio']));
    const oldTracks = getOfflineLessonTracks((await getDownloadedLesson('older'))!);
    expect(oldTracks[0].partCount).toBeUndefined();
    expect(oldTracks[0].duration).toBe(0);
    expect(isLastPart(oldTracks[0])).toBe(false);

    dbState.stores.get('lesson-meta')!.set('legacy-single', {
      lessonId: 'legacy-single',
      title: 'Single',
      audioUrl: '/single.mp3',
      duration: 120,
      date: '2026-05-10',
    });
    dbState.stores.get('audio-cache')!.set('legacy-single', new Blob(['audio']));
    const singleTracks = getOfflineLessonTracks((await getDownloadedLesson('legacy-single'))!);
    expect(singleTracks[0]).toMatchObject({ partIndex: 0, partCount: 1, duration: 120 });
    expect(isLastPart(singleTracks[0])).toBe(true);
  });

  it('filters downloaded lesson metadata to files that still have audio blobs', async () => {
    mockAudioFetch();
    const {
      saveAudioFilesOffline,
      getDownloadedLesson,
      getDownloadedLessons,
    } = await loadOfflineStorage();

    await saveAudioFilesOffline(
      'lesson-stale-meta',
      [
        { audioFileId: 'audio-1', audioUrl: '/api/audio/stream/part-1.mp3', title: 'Part 1' },
        { audioFileId: 'audio-2', audioUrl: '/api/audio/stream/part-2.mp3', title: 'Part 2' },
      ],
      {
        lessonId: 'lesson-stale-meta',
        title: 'Lesson',
        hebrewTitle: 'שיעור',
        duration: 30,
        date: '2026-05-10',
      }
    );

    dbState.stores.get('audio-cache')?.delete('lesson-stale-meta:audio-1');

    const partiallyAvailable = await getDownloadedLesson('lesson-stale-meta');
    expect(partiallyAvailable?.audioFiles.map((file) => file.offlineKey)).toEqual([
      'lesson-stale-meta:audio-2',
    ]);
    expect(partiallyAvailable?.fileSize).toBe('second-file'.length);

    dbState.stores.get('audio-cache')?.delete('lesson-stale-meta:audio-2');

    expect(await getDownloadedLesson('lesson-stale-meta')).toBeNull();
    expect(await getDownloadedLessons()).toEqual([]);
  });

  it('keeps completed files and reports failure when a later file keeps failing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const fetchMock = mockAudioFetch(true);
    const {
      saveAudioFilesOffline,
      getDownloadedLesson,
      getOfflineAudioUrl,
    } = await loadOfflineStorage();

    const pending = saveAudioFilesOffline(
      'lesson-2',
      [
        { audioFileId: 'audio-1', audioUrl: '/api/audio/stream/part-1.mp3', title: 'Part 1' },
        { audioFileId: 'audio-2', audioUrl: '/api/audio/stream/part-2.mp3', title: 'Part 2' },
      ],
      {
        lessonId: 'lesson-2',
        title: 'Lesson',
        hebrewTitle: 'שיעור',
        duration: 0,
        date: '2026-05-10',
      }
    );
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(result).toEqual({ ok: false, reason: 'failed' });
    // part 1 once, part 2 three attempts
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('part-2'))).toHaveLength(3);
    const saved = await getDownloadedLesson('lesson-2');
    expect(saved?.audioFiles.map((file) => file.offlineKey)).toEqual(['lesson-2:audio-1']);
    expect(await getOfflineAudioUrl('lesson-2', '/api/audio/stream/part-1.mp3')).toMatch(/^blob:audio-/);
    expect(await getOfflineAudioUrl('lesson-2', '/api/audio/stream/part-2.mp3')).toBeNull();
  });

  it('rejects a truncated body instead of saving it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubGlobal(
      'fetch',
      // 99 of 100 bytes: within the old 5% tolerance, still a broken file.
      vi.fn(async () => new Response('x'.repeat(99), { status: 200, headers: { 'content-length': '100' } })),
    );
    const { saveAudioFilesOffline, isLessonDownloaded } = await loadOfflineStorage();

    const pending = saveAudioFilesOffline(
      'lesson-truncated',
      [{ audioFileId: 'audio-1', audioUrl: '/api/audio/stream/part-1.mp3' }],
      { lessonId: 'lesson-truncated', title: 'Lesson', hebrewTitle: 'שיעור', duration: 0, date: '2026-05-10' }
    );
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(await isLessonDownloaded('lesson-truncated')).toBe(false);
  });

  it('reports a full disk as quota without retrying the download', async () => {
    const fetchMock = mockAudioFetch();
    dbState.putError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    const { saveAudioFilesOffline, isLessonDownloaded } = await loadOfflineStorage();

    const result = await saveAudioFilesOffline(
      'lesson-quota',
      [
        { audioFileId: 'audio-1', audioUrl: '/api/audio/stream/part-1.mp3' },
        { audioFileId: 'audio-2', audioUrl: '/api/audio/stream/part-2.mp3' },
      ],
      { lessonId: 'lesson-quota', title: 'Lesson', hebrewTitle: 'שיעור', duration: 0, date: '2026-05-10' }
    );

    expect(result).toEqual({ ok: false, reason: 'quota' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await isLessonDownloaded('lesson-quota')).toBe(false);
  });

  it('downloads straight from R2 via the download route, falling back to the stream proxy', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/audio/download/')) throw new TypeError('Failed to fetch');
      return new Response('first', { status: 200, headers: { 'content-length': '5' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { saveAudioFilesOffline } = await loadOfflineStorage();

    const result = await saveAudioFilesOffline(
      'lesson-direct',
      [{ audioFileId: 'audio-1', audioUrl: '/api/audio/stream/audio%2Fpart-1.opus' }],
      { lessonId: 'lesson-direct', title: 'Lesson', hebrewTitle: 'שיעור', duration: 0, date: '2026-05-10' }
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/audio/download/audio%2Fpart-1.opus?disposition=inline',
      '/api/audio/stream/audio%2Fpart-1.opus',
    ]);
  });

  it('deletes every cached audio file for a downloaded lesson', async () => {
    mockAudioFetch();
    const {
      deleteDownloadedLesson,
      saveAudioFilesOffline,
      getOfflineAudioUrl,
      isLessonDownloaded,
    } = await loadOfflineStorage();

    await saveAudioFilesOffline(
      'lesson-3',
      [
        { audioFileId: 'audio-1', audioUrl: '/api/audio/stream/part-1.mp3', title: 'Part 1' },
        { audioFileId: 'audio-2', audioUrl: '/api/audio/stream/part-2.mp3', title: 'Part 2' },
      ],
      {
        lessonId: 'lesson-3',
        title: 'Lesson',
        hebrewTitle: 'שיעור',
        duration: 0,
        date: '2026-05-10',
      }
    );

    await deleteDownloadedLesson('lesson-3');

    expect(await isLessonDownloaded('lesson-3')).toBe(false);
    expect(await getOfflineAudioUrl('lesson-3', '/api/audio/stream/part-1.mp3')).toBeNull();
    expect(await getOfflineAudioUrl('lesson-3', '/api/audio/stream/part-2.mp3')).toBeNull();
  });
});
