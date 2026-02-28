'use client';

import { openDB, type IDBPDatabase } from 'idb';
import { normalizeAudioUrl } from '@/lib/audio-url';

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

// ── Blob URL Cache ──
// Prevents memory leaks: one blob URL per lesson, reused across calls
const blobUrlCache = new Map<string, string>();

/**
 * Get a blob URL for an offline lesson.
 * Caches the URL so repeated calls don't create new object URLs.
 */
export async function getOfflineAudioUrl(lessonId: string): Promise<string | null> {
  try {
    // Return cached blob URL if it exists
    const cached = blobUrlCache.get(lessonId);
    if (cached) return cached;

    const db = await getDB();
    const blob = await db.get(AUDIO_STORE, lessonId);
    if (!blob) return null;

    const url = URL.createObjectURL(blob);
    blobUrlCache.set(lessonId, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Revoke a specific lesson's blob URL to free memory.
 */
export function revokeOfflineAudioUrl(lessonId: string) {
  const url = blobUrlCache.get(lessonId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(lessonId);
  }
}

/**
 * Revoke all cached blob URLs (e.g., on unload or track change).
 */
export function revokeAllOfflineAudioUrls() {
  for (const [, url] of blobUrlCache) {
    URL.revokeObjectURL(url);
  }
  blobUrlCache.clear();
}

// ── Download with retry and cleanup ──

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

export async function downloadLesson(
  lessonId: string,
  audioUrl: string,
  meta: Omit<OfflineLessonMeta, 'downloadedAt'>,
  onProgress?: (percent: number) => void
): Promise<boolean> {
  // Normalize URL to use the streaming proxy
  const normalizedUrl = normalizeAudioUrl(audioUrl) || audioUrl;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Wait before retry with exponential backoff
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        onProgress?.(0); // Reset progress on retry
      }

      const response = await fetch(normalizedUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

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

      // Integrity check: if server told us content-length, verify we got it all
      if (contentLength > 0 && received < contentLength * 0.95) {
        throw new Error(`Incomplete download: got ${received}/${contentLength} bytes`);
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
      console.error(`Download attempt ${attempt + 1} failed:`, error);

      // On final attempt failure, clean up any partial data
      if (attempt === MAX_RETRIES) {
        try {
          const db = await getDB();
          await db.delete(AUDIO_STORE, lessonId);
          await db.delete(META_STORE, lessonId);
        } catch {
          // Cleanup itself failed — nothing we can do
        }
        return false;
      }
    }
  }

  return false;
}

export async function isLessonDownloaded(lessonId: string): Promise<boolean> {
  try {
    const db = await getDB();
    const meta = await db.get(META_STORE, lessonId);
    if (!meta) return false;
    // Also verify the audio blob exists (protect against partial state)
    const blob = await db.get(AUDIO_STORE, lessonId);
    return !!blob;
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
    // Revoke blob URL first to free memory
    revokeOfflineAudioUrl(lessonId);
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
