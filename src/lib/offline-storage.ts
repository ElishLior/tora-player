'use client';

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'tora-player-offline';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio-cache';
const META_STORE = 'lesson-meta';

interface OfflineLessonMeta {
  lessonId: string;
  title: string;
  hebrewTitle: string;
  audioUrl: string;
  duration: number;
  fileSize: number;
  downloadedAt: string;
  seriesName?: string;
  date: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'lessonId' });
        }
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          db.createObjectStore(AUDIO_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function downloadLesson(
  lessonId: string,
  audioUrl: string,
  meta: Omit<OfflineLessonMeta, 'downloadedAt'>,
  onProgress?: (percent: number) => void
): Promise<boolean> {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error('Download failed');

    const contentLength = Number(response.headers.get('content-length') || 0);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0 && onProgress) {
        onProgress(Math.round((received / contentLength) * 100));
      }
    }

    const blob = new Blob(chunks as BlobPart[]);
    const db = await getDB();

    // Store audio blob
    await db.put(AUDIO_STORE, blob, lessonId);

    // Store metadata
    await db.put(META_STORE, {
      ...meta,
      lessonId,
      fileSize: blob.size,
      downloadedAt: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    console.error('Download error:', error);
    return false;
  }
}

export async function getOfflineAudioUrl(lessonId: string): Promise<string | null> {
  try {
    const db = await getDB();
    const blob = await db.get(AUDIO_STORE, lessonId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function isLessonDownloaded(lessonId: string): Promise<boolean> {
  try {
    const db = await getDB();
    const meta = await db.get(META_STORE, lessonId);
    return !!meta;
  } catch {
    return false;
  }
}

export async function getDownloadedLessons(): Promise<OfflineLessonMeta[]> {
  try {
    const db = await getDB();
    return await db.getAll(META_STORE);
  } catch {
    return [];
  }
}

export async function deleteDownloadedLesson(lessonId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(AUDIO_STORE, lessonId);
    await db.delete(META_STORE, lessonId);
  } catch {
    console.error('Delete offline lesson error');
  }
}

export async function getStorageUsage(): Promise<{ used: number; quota: number }> {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
  } catch {
    // Fallback
  }
  return { used: 0, quota: 0 };
}
