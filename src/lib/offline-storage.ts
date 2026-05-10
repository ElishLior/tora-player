'use client';

import { openDB, type IDBPDatabase } from 'idb';
import { normalizeAudioUrl } from '@/lib/audio-url';

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
const RETRY_DELAY_MS = 500;

async function requestPersistentStorage() {
  try {
    if (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'persist' in navigator.storage
    ) {
      await navigator.storage.persist();
    }
  } catch {
    // Persistence is a best-effort browser hint.
  }
}

async function fetchAudioBlob(
  url: string,
  onProgress?: (percent: number) => void
): Promise<{ blob: Blob; mimeType: string }> {
  const response = await fetch(normalizedAudioUrl(url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentLength = Number(response.headers.get('content-length') || 0);
  const mimeType = response.headers.get('content-type') || 'audio/mpeg';
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No readable stream');

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      onProgress?.(Math.round((received / contentLength) * 100));
    }
  }

  // Integrity check: if server told us content-length, verify we got it all.
  if (contentLength > 0 && received < contentLength * 0.95) {
    throw new Error(`Incomplete download: got ${received}/${contentLength} bytes`);
  }

  if (contentLength === 0) {
    onProgress?.(100);
  }

  return {
    blob: new Blob(chunks as BlobPart[], { type: mimeType }),
    mimeType,
  };
}

export async function downloadLessonAudioFiles(
  lessonId: string,
  audioFiles: OfflineAudioDownloadInput[],
  meta: OfflineLessonInput,
  onProgress?: (percent: number) => void
): Promise<boolean> {
  if (audioFiles.length === 0) return false;

  await requestPersistentStorage();
  const touchedKeys = new Set<string>();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const downloadedKeys: string[] = [];

    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        onProgress?.(0);
      }

      const db = await getDB();
      const previousMeta = normalizeLessonMeta(
        await db.get(META_STORE, lessonId) as Partial<OfflineLessonMeta> | undefined
      );
      const completedFiles: OfflineAudioFileMeta[] = [];
      const downloadedAt = new Date().toISOString();

      for (const [index, file] of audioFiles.entries()) {
        const offlineKey = getOfflineKey(lessonId, file);
        const normalizedUrl = normalizedAudioUrl(file.audioUrl);
        const { blob, mimeType } = await fetchAudioBlob(normalizedUrl, (filePercent) => {
          const aggregate = Math.round(((index + filePercent / 100) / audioFiles.length) * 100);
          onProgress?.(aggregate);
        });

        await db.put(AUDIO_STORE, blob, offlineKey);
        downloadedKeys.push(offlineKey);
        touchedKeys.add(offlineKey);

        completedFiles.push({
          offlineKey,
          lessonId,
          audioFileId: file.audioFileId,
          fileKey: file.fileKey,
          audioUrl: normalizedUrl,
          title: file.title || file.originalName || undefined,
          originalName: file.originalName,
          audioType: file.audioType,
          mimeType,
          duration: file.duration || 0,
          fileSize: blob.size,
          sortOrder: file.sortOrder ?? index,
          downloadedAt,
        });
      }

      const replacedKeys = new Set(completedFiles.map((file) => file.offlineKey));
      const mergedFiles = [
        ...(previousMeta?.audioFiles.filter((file) => !replacedKeys.has(file.offlineKey)) ?? []),
        ...completedFiles,
      ].sort((a, b) => a.sortOrder - b.sortOrder);

      await db.put(META_STORE, {
        ...meta,
        lessonId,
        audioUrl: mergedFiles[0]?.audioUrl || meta.audioUrl || '',
        duration: meta.duration || mergedFiles.reduce((total, file) => total + file.duration, 0),
        fileSize: mergedFiles.reduce((total, file) => total + file.fileSize, 0),
        downloadedAt,
        audioFiles: mergedFiles,
      });

      onProgress?.(100);
      return true;
    } catch (error) {
      console.error(`Download attempt ${attempt + 1} failed:`, error);

      try {
        const db = await getDB();
        for (const key of downloadedKeys) {
          revokeOfflineAudioUrl(key);
          await db.delete(AUDIO_STORE, key);
        }
      } catch {
        // Retry/final cleanup below will make another best-effort pass.
      }

      if (attempt === MAX_RETRIES) {
        try {
          const db = await getDB();
          for (const key of touchedKeys) {
            revokeOfflineAudioUrl(key);
            await db.delete(AUDIO_STORE, key);
          }

          const currentMeta = normalizeLessonMeta(
            await db.get(META_STORE, lessonId) as Partial<OfflineLessonMeta> | undefined
          );

          if (currentMeta) {
            const remainingFiles = currentMeta.audioFiles.filter((file) => !touchedKeys.has(file.offlineKey));
            if (remainingFiles.length === 0) {
              await db.delete(META_STORE, lessonId);
            } else {
              await db.put(META_STORE, {
                ...currentMeta,
                fileSize: remainingFiles.reduce((total, file) => total + file.fileSize, 0),
                audioFiles: remainingFiles,
              });
            }
          }
        } catch {
          // Cleanup itself failed — nothing more to do.
        }
        return false;
      }
    }
  }

  return false;
}

export async function downloadLesson(
  lessonId: string,
  audioUrl: string,
  meta: Omit<OfflineLessonMeta, 'downloadedAt' | 'audioFiles'>,
  onProgress?: (percent: number) => void
): Promise<boolean> {
  return downloadLessonAudioFiles(
    lessonId,
    [{ audioUrl, duration: meta.duration, sortOrder: 0 }],
    {
      lessonId,
      title: meta.title,
      hebrewTitle: meta.hebrewTitle,
      duration: meta.duration,
      seriesName: meta.seriesName,
      date: meta.date,
      audioUrl,
      fileSize: meta.fileSize,
    },
    onProgress
  );
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

export async function deleteDownloadedLesson(lessonId: string): Promise<void> {
  try {
    const db = await getDB();
    const meta = normalizeLessonMeta(await db.get(META_STORE, lessonId) as Partial<OfflineLessonMeta> | undefined);
    const keys = meta?.audioFiles.map((file) => file.offlineKey) ?? [lessonId];

    for (const key of keys) {
      revokeOfflineAudioUrl(key);
      await db.delete(AUDIO_STORE, key);
    }
    await db.delete(META_STORE, lessonId);
  } catch {
    console.error('Delete offline lesson error');
  }
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
