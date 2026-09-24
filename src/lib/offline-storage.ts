'use client';

import { openDB, type IDBPDatabase } from 'idb';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { getAudioContentType, getAudioDirectUrl } from '@/lib/audio-download';
import { notifyOfflineDownloadsChanged } from '@/lib/offline-events';

const DB_NAME = 'tora-player-offline';
const DB_VERSION = 2;
const AUDIO_STORE = 'audio-cache';
const META_STORE = 'lesson-meta';

export interface OfflineAudioFileMeta {
  offlineKey: string;
  lessonId: string;
  audioFileId?: string;
  fileKey?: string;
  audioUrl: string;
  title?: string;
  originalName?: string | null;
  audioType?: string | null;
  mimeType: string;
  duration: number;
  fileSize: number;
  sortOrder: number;
  downloadedAt: string;
}

export interface OfflineLessonMeta {
  lessonId: string;
  title: string;
  hebrewTitle: string;
  audioUrl: string;
  duration: number;
  fileSize: number;
  downloadedAt: string;
  seriesName?: string;
  date: string;
  audioFiles: OfflineAudioFileMeta[];
}

export interface OfflineAudioDownloadInput {
  audioFileId?: string;
  fileKey?: string;
  audioUrl: string;
  title?: string;
  originalName?: string | null;
  audioType?: string | null;
  duration?: number;
  fileSize?: number;
  sortOrder?: number;
}

export type OfflineLessonInput = Omit<
  OfflineLessonMeta,
  'audioUrl' | 'fileSize' | 'downloadedAt' | 'audioFiles'
> & {
  audioUrl?: string;
  fileSize?: number;
};

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

function normalizedAudioUrl(url: string | null | undefined): string {
  return normalizeAudioUrl(url) || url || '';
}

function urlsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizedAudioUrl(a) === normalizedAudioUrl(b) || a === b;
}

export function getOfflineKey(
  lessonId: string,
  file: {
    offlineKey?: string | null;
    audioFileId?: string | null;
    fileKey?: string | null;
    audioUrl?: string | null;
  } = {}
): string {
  if (file.offlineKey) return file.offlineKey;
  if (file.audioFileId) return `${lessonId}:${file.audioFileId}`;
  if (file.fileKey) return `${lessonId}:${file.fileKey}`;
  if (file.audioUrl) return `${lessonId}:${normalizedAudioUrl(file.audioUrl)}`;
  return `${lessonId}:primary`;
}

function normalizeLessonMeta(meta: Partial<OfflineLessonMeta> | null | undefined): OfflineLessonMeta | null {
  if (!meta?.lessonId) return null;

  const legacyAudioUrl = meta.audioUrl || '';
  const audioFiles = Array.isArray(meta.audioFiles) && meta.audioFiles.length > 0
    ? meta.audioFiles
    : legacyAudioUrl
      ? [
          {
            offlineKey: meta.lessonId,
            lessonId: meta.lessonId,
            audioUrl: legacyAudioUrl,
            mimeType: 'audio/mpeg',
            duration: meta.duration || 0,
            fileSize: meta.fileSize || 0,
            sortOrder: 0,
            downloadedAt: meta.downloadedAt || new Date(0).toISOString(),
          },
        ]
      : [];

  return {
    lessonId: meta.lessonId,
    title: meta.title || '',
    hebrewTitle: meta.hebrewTitle || meta.title || '',
    audioUrl: legacyAudioUrl || audioFiles[0]?.audioUrl || '',
    duration: meta.duration || audioFiles.reduce((total, file) => total + (file.duration || 0), 0),
    fileSize: meta.fileSize || audioFiles.reduce((total, file) => total + (file.fileSize || 0), 0),
    downloadedAt: meta.downloadedAt || audioFiles[0]?.downloadedAt || new Date(0).toISOString(),
    seriesName: meta.seriesName,
    date: meta.date || '',
    audioFiles: audioFiles
      .map((file, index) => ({
        offlineKey: file.offlineKey || getOfflineKey(meta.lessonId!, file),
        lessonId: file.lessonId || meta.lessonId!,
        audioFileId: file.audioFileId,
        fileKey: file.fileKey,
        audioUrl: file.audioUrl,
        title: file.title,
        originalName: file.originalName,
        audioType: file.audioType,
        mimeType: file.mimeType || 'audio/mpeg',
        duration: file.duration || 0,
        fileSize: file.fileSize || 0,
        sortOrder: file.sortOrder ?? index,
        downloadedAt: file.downloadedAt || meta.downloadedAt || new Date(0).toISOString(),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

async function resolveOfflineKey(
  db: IDBPDatabase,
  lessonId: string,
  audioUrl?: string | null,
  preferredOfflineKey?: string | null
): Promise<string | null> {
  if (preferredOfflineKey && await db.get(AUDIO_STORE, preferredOfflineKey)) {
    return preferredOfflineKey;
  }

  if (!audioUrl && lessonId.includes(':') && await db.get(AUDIO_STORE, lessonId)) {
    return lessonId;
  }

  const meta = normalizeLessonMeta(await db.get(META_STORE, lessonId) as Partial<OfflineLessonMeta> | undefined);
  if (meta) {
    if (audioUrl) {
      const matchedFile = meta.audioFiles.find((file) => urlsMatch(file.audioUrl, audioUrl));
      if (matchedFile && await db.get(AUDIO_STORE, matchedFile.offlineKey)) {
        return matchedFile.offlineKey;
      }
    }

    if (!audioUrl && meta.audioFiles.length === 1 && await db.get(AUDIO_STORE, meta.audioFiles[0].offlineKey)) {
      return meta.audioFiles[0].offlineKey;
    }
  }

  if (
    await db.get(AUDIO_STORE, lessonId) &&
    (!audioUrl || !meta || urlsMatch(meta.audioUrl, audioUrl))
  ) {
    return lessonId;
  }

  return null;
}

async function filterMetaToAvailableAudio(
  db: IDBPDatabase,
  rawMeta: Partial<OfflineLessonMeta> | null | undefined
): Promise<OfflineLessonMeta | null> {
  const meta = normalizeLessonMeta(rawMeta);
  if (!meta) return null;

  const existingFiles: OfflineAudioFileMeta[] = [];
  for (const file of meta.audioFiles) {
    if (await db.get(AUDIO_STORE, file.offlineKey)) {
      existingFiles.push(file);
    }
  }

  if (existingFiles.length === 0) return null;

  return {
    ...meta,
    audioUrl: existingFiles.find((file) => urlsMatch(file.audioUrl, meta.audioUrl))?.audioUrl ||
      existingFiles[0].audioUrl ||
      meta.audioUrl,
    fileSize: existingFiles.reduce((total, file) => total + file.fileSize, 0),
    audioFiles: existingFiles,
  };
}

// ── Blob URL Cache ──
// Prevents memory leaks: one blob URL per offline audio file, reused across calls.
const blobUrlCache = new Map<string, string>();

/**
 * Get a blob URL for an offline lesson/audio file.
 * Caches the URL so repeated calls don't create new object URLs.
 */
export async function getOfflineAudioUrl(
  lessonId: string,
  audioUrl?: string | null,
  preferredOfflineKey?: string | null
): Promise<string | null> {
  try {
    const db = await getDB();
    const offlineKey = await resolveOfflineKey(db, lessonId, audioUrl, preferredOfflineKey);
    if (!offlineKey) return null;

    const cached = blobUrlCache.get(offlineKey);
    if (cached) return cached;

    const blob = await db.get(AUDIO_STORE, offlineKey);
    if (!blob) return null;

    const url = URL.createObjectURL(blob);
    blobUrlCache.set(offlineKey, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Revoke a specific lesson/audio file blob URL to free memory.
 */
export function revokeOfflineAudioUrl(offlineKey: string) {
  const url = blobUrlCache.get(offlineKey);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(offlineKey);
  }
}

// ── Saving audio for offline listening ──

export type OfflineSaveResult = { ok: true } | { ok: false; reason: 'quota' | 'failed' };

const MAX_ATTEMPTS_PER_FILE = 3;
const RETRY_DELAY_MS = 1000;

async function requestPersistentStorage() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Persistence is a browser hint; saving works without it.
  }
}

async function fetchAudioResponse(audioUrl: string): Promise<Response> {
  const directUrl = getAudioDirectUrl(audioUrl);
  if (directUrl) {
    try {
      return await fetch(directUrl);
    } catch (error) {
      // The redirect goes to R2 cross-origin; if the bucket's CORS rules reject
      // it, the same-origin stream proxy still serves the file.
      console.warn('Direct R2 fetch failed, using the stream proxy:', error);
    }
  }
  return fetch(audioUrl);
}

/**
 * Download one audio file as a Blob. The body is counted as it streams into a
 * single Blob (no second in-memory copy) and must match Content-Length exactly.
 */
async function fetchAudioBlob(audioUrl: string, onProgress: (fraction: number) => void): Promise<Blob> {
  const response = await fetchAudioResponse(audioUrl);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

  const encoding = response.headers.get('Content-Encoding');
  // A compressed body's length differs from Content-Length, so it can't be checked.
  const expectedBytes = !encoding || encoding === 'identity' ? Number(response.headers.get('Content-Length')) || 0 : 0;
  const mimeType = response.headers.get('Content-Type') || getAudioContentType(audioUrl);

  let received = 0;
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (expectedBytes > 0) onProgress(Math.min(received / expectedBytes, 1));
        controller.enqueue(chunk);
      },
    }),
  );
  const blob = await new Response(counted, { headers: { 'Content-Type': mimeType } }).blob();

  if (expectedBytes > 0 && blob.size !== expectedBytes) {
    throw new Error(`Incomplete download: got ${blob.size}/${expectedBytes} bytes`);
  }
  return blob;
}

async function saveLessonMeta(
  db: IDBPDatabase,
  meta: OfflineLessonInput,
  savedFile: OfflineAudioFileMeta,
): Promise<void> {
  const previous = normalizeLessonMeta(
    await db.get(META_STORE, meta.lessonId) as Partial<OfflineLessonMeta> | undefined
  );
  const audioFiles = [
    ...(previous?.audioFiles.filter((file) => file.offlineKey !== savedFile.offlineKey) ?? []),
    savedFile,
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  await db.put(META_STORE, {
    ...meta,
    audioUrl: audioFiles[0].audioUrl,
    duration: meta.duration || audioFiles.reduce((total, file) => total + file.duration, 0),
    fileSize: audioFiles.reduce((total, file) => total + file.fileSize, 0),
    downloadedAt: savedFile.downloadedAt,
    audioFiles,
  });
}

/**
 * Save a lesson's audio files to IndexedDB for offline listening.
 *
 * Each file is committed (blob + metadata) as soon as it is complete, so a
 * failure keeps the files already saved and a retry only needs the rest.
 * Network errors are retried per file; a full disk is reported immediately
 * as `reason: 'quota'`.
 */
export async function saveAudioFilesOffline(
  lessonId: string,
  audioFiles: OfflineAudioDownloadInput[],
  meta: OfflineLessonInput,
  onProgress?: (percent: number) => void
): Promise<OfflineSaveResult> {
  if (audioFiles.length === 0) return { ok: false, reason: 'failed' };

  await requestPersistentStorage();
  const db = await getDB();
  const lessonMeta = { ...meta, lessonId };
  let result: OfflineSaveResult = { ok: true };

  for (const [index, file] of audioFiles.entries()) {
    const audioUrl = normalizedAudioUrl(file.audioUrl);
    const reportProgress = (fraction: number) =>
      onProgress?.(Math.round(((index + fraction) / audioFiles.length) * 100));

    let savedFile: OfflineAudioFileMeta | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_FILE && !savedFile; attempt++) {
      try {
        reportProgress(0);
        const blob = await fetchAudioBlob(audioUrl, reportProgress);
        const offlineKey = getOfflineKey(lessonId, file);
        await db.put(AUDIO_STORE, blob, offlineKey);

        const fileMeta: OfflineAudioFileMeta = {
          offlineKey,
          lessonId,
          audioFileId: file.audioFileId,
          fileKey: file.fileKey,
          audioUrl,
          title: file.title || file.originalName || undefined,
          originalName: file.originalName,
          audioType: file.audioType,
          mimeType: blob.type || getAudioContentType(audioUrl),
          duration: file.duration || 0,
          fileSize: blob.size,
          sortOrder: file.sortOrder ?? index,
          downloadedAt: new Date().toISOString(),
        };
        await saveLessonMeta(db, lessonMeta, fileMeta);
        savedFile = fileMeta;
      } catch (error) {
        console.error(`Offline save of ${audioUrl} failed (attempt ${attempt}):`, error);
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          notifyOfflineDownloadsChanged(lessonId);
          return { ok: false, reason: 'quota' };
        }
        if (attempt < MAX_ATTEMPTS_PER_FILE) {
          // Not Promise.withResolvers: it needs iOS 17.4+.
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        }
      }
    }

    if (!savedFile) result = { ok: false, reason: 'failed' };
  }

  if (result.ok) onProgress?.(100);
  notifyOfflineDownloadsChanged(lessonId);
  return result;
}

/** The stored audio Blob for a saved file, or null when it isn't saved. */
export async function getOfflineAudioBlob(
  lessonId: string,
  audioUrl?: string | null,
  preferredOfflineKey?: string | null
): Promise<Blob | null> {
  try {
    const db = await getDB();
    const offlineKey = await resolveOfflineKey(db, lessonId, audioUrl, preferredOfflineKey);
    return offlineKey ? ((await db.get(AUDIO_STORE, offlineKey)) as Blob | undefined) ?? null : null;
  } catch {
    return null;
  }
}

export async function isLessonDownloaded(lessonId: string): Promise<boolean> {
  try {
    const db = await getDB();
    const meta = normalizeLessonMeta(await db.get(META_STORE, lessonId) as Partial<OfflineLessonMeta> | undefined);
    if (!meta) return false;
    if (meta.audioFiles.length === 0) return false;

    const blobChecks = await Promise.all(
      meta.audioFiles.map((file) => db.get(AUDIO_STORE, file.offlineKey))
    );
    return blobChecks.every(Boolean);
  } catch {
    return false;
  }
}

export async function isAudioFileDownloaded(
  lessonId: string,
  audioUrl?: string | null,
  preferredOfflineKey?: string | null
): Promise<boolean> {
  try {
    const db = await getDB();
    const offlineKey = await resolveOfflineKey(db, lessonId, audioUrl, preferredOfflineKey);
    if (!offlineKey) return false;
    return !!(await db.get(AUDIO_STORE, offlineKey));
  } catch {
    return false;
  }
}

export async function getDownloadedLesson(lessonId: string): Promise<OfflineLessonMeta | null> {
  try {
    const db = await getDB();
    return filterMetaToAvailableAudio(
      db,
      await db.get(META_STORE, lessonId) as Partial<OfflineLessonMeta> | undefined
    );
  } catch {
    return null;
  }
}

export async function getDownloadedLessons(): Promise<OfflineLessonMeta[]> {
  try {
    const db = await getDB();
    const lessons = await db.getAll(META_STORE) as Partial<OfflineLessonMeta>[];
    const availableLessons = await Promise.all(
      lessons.map((lesson) => filterMetaToAvailableAudio(db, lesson))
    );
    return availableLessons
      .filter((lesson): lesson is OfflineLessonMeta => !!lesson)
      .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
  } catch {
    return [];
  }
}

/**
 * Remove a saved lesson. Blob URLs are left alone: the lesson may be playing
 * right now, and lookups check IndexedDB before the URL cache, so the deleted
 * files are no longer offered. The player revokes the URL when it moves on.
 */
export async function deleteDownloadedLesson(lessonId: string): Promise<void> {
  try {
    const db = await getDB();
    const meta = normalizeLessonMeta(await db.get(META_STORE, lessonId) as Partial<OfflineLessonMeta> | undefined);
    const keys = meta?.audioFiles.map((file) => file.offlineKey) ?? [lessonId];

    for (const key of keys) {
      await db.delete(AUDIO_STORE, key);
    }
    await db.delete(META_STORE, lessonId);
  } catch (error) {
    console.error('Delete offline lesson error:', error);
  }
  notifyOfflineDownloadsChanged(lessonId);
}

export async function getStorageUsage(): Promise<{ used: number; quota: number }> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'estimate' in navigator.storage
    ) {
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
