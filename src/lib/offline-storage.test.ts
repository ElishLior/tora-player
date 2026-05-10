import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => ({
  stores: new Map<string, Map<IDBValidKey, unknown>>(),
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
      downloadLessonAudioFiles,
      getDownloadedLessons,
      getOfflineAudioUrl,
      isLessonDownloaded,
    } = await loadOfflineStorage();

    const success = await downloadLessonAudioFiles(
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

    expect(success).toBe(true);
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
    const { downloadLessonAudioFiles, getOfflineAudioUrl } = await loadOfflineStorage();

    const success = await downloadLessonAudioFiles(
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

    expect(success).toBe(true);
    expect(await getOfflineAudioUrl('lesson-secondary-only', '/api/audio/stream/part-1.mp3')).toBeNull();
    expect(await getOfflineAudioUrl('lesson-secondary-only', '/api/audio/stream/part-2.mp3')).toMatch(/^blob:audio-/);
    expect(await getOfflineAudioUrl('lesson-secondary-only')).toMatch(/^blob:audio-/);
  });

  it('filters downloaded lesson metadata to files that still have audio blobs', async () => {
    mockAudioFetch();
    const {
      downloadLessonAudioFiles,
      getDownloadedLesson,
      getDownloadedLessons,
    } = await loadOfflineStorage();

    await downloadLessonAudioFiles(
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

  it('cleans partial lesson data when a multi-file download fails', async () => {
    mockAudioFetch(true);
    const {
      downloadLessonAudioFiles,
      getDownloadedLessons,
      getOfflineAudioUrl,
      isLessonDownloaded,
    } = await loadOfflineStorage();

    const success = await downloadLessonAudioFiles(
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

    expect(success).toBe(false);
    expect(await isLessonDownloaded('lesson-2')).toBe(false);
    expect(await getDownloadedLessons()).toEqual([]);
    expect(await getOfflineAudioUrl('lesson-2', '/api/audio/stream/part-1.mp3')).toBeNull();
  });

  it('deletes every cached audio file for a downloaded lesson', async () => {
    mockAudioFetch();
    const {
      deleteDownloadedLesson,
      downloadLessonAudioFiles,
      getOfflineAudioUrl,
      isLessonDownloaded,
    } = await loadOfflineStorage();

    await downloadLessonAudioFiles(
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
