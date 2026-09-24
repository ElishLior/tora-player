'use client';

import { useState, useCallback } from 'react';
import type { AudioMetadata } from '@/lib/audio-utils';
import { transcodeToOpus } from '@/lib/audio-transcode';

// 3.5 MB chunks stay well under Vercel's 4.5 MB request body limit.
const CHUNK_SIZE = 3.5 * 1024 * 1024;
// Must match MAX_IMAGE_BYTES in /api/upload/image.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2560;

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return (data && typeof data.error === 'string' && data.error) || `${fallback} (${res.status})`;
}

function postChunk(form: FormData, onChunkProgress: (fraction: number) => void): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const xhr = new XMLHttpRequest();
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) onChunkProgress(e.loaded / e.total);
  });
  xhr.addEventListener('load', () => {
    if (xhr.status >= 200 && xhr.status < 300) return resolve();
    let msg = `Chunk upload failed (${xhr.status})`;
    try {
      const data = JSON.parse(xhr.responseText);
      if (data.error) msg = data.error;
    } catch { /* non-JSON error body */ }
    reject(new Error(msg));
  });
  xhr.addEventListener('error', () => reject(new Error('Upload failed — network error')));
  xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));
  xhr.open('POST', '/api/upload/chunk');
  xhr.timeout = 120000;
  xhr.send(form);
  return promise;
}

export interface AudioUploadOptions {
  lessonId: string;
  sortOrder: number;
  /** lesson_audio.audio_type: 'סידור' / 'עץ חיים' / 'קצרים' / custom. */
  audioType?: string | null;
  /** Seconds, read client-side from the audio metadata. */
  duration?: number;
  /** Transcode to Opus first (large or lossless files). */
  transcode?: boolean;
  onProgress?: (percent: number) => void;
}

/**
 * Upload one audio file in chunks and record it in lesson_audio.
 * Throws with the server's message on any failure so callers can offer a retry.
 */
export async function uploadAudioFile(file: File, options: AudioUploadOptions): Promise<string> {
  const { lessonId, sortOrder, audioType, duration, transcode, onProgress } = options;
  let source = file;
  if (transcode) {
    onProgress?.(0);
    try {
      source = await transcodeToOpus(file, {}, (tp) => onProgress?.(Math.round(tp.percent * 0.4)));
    } catch (err) {
      console.warn('Transcoding failed, uploading original:', err);
    }
  }

  const uploadId = crypto.randomUUID();
  const totalParts = Math.max(1, Math.ceil(source.size / CHUNK_SIZE));
  const offset = source === file ? 0 : 40;
  const range = 95 - offset;

  for (let partNumber = 0; partNumber < totalParts; partNumber++) {
    const form = new FormData();
    form.append('uploadId', uploadId);
    form.append('lessonId', lessonId);
    form.append('partNumber', String(partNumber));
    form.append('chunk', source.slice(partNumber * CHUNK_SIZE, (partNumber + 1) * CHUNK_SIZE), `chunk_${partNumber}`);
    await postChunk(form, (fraction) =>
      onProgress?.(Math.round(offset + ((partNumber + fraction) / totalParts) * range)),
    );
  }

  const res = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId,
      totalParts,
      lessonId,
      fileName: source.name,
      originalName: file.name,
      fileSize: source.size,
      sortOrder,
      duration: duration && Number.isFinite(duration) ? Math.round(duration) : 0,
      audioType: audioType || null,
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to complete upload'));
  const result = await res.json();
  onProgress?.(100);
  return result.publicUrl as string;
}

/**
 * Re-encode photos the server won't accept as-is: HEIC/HEIF (not displayable
 * outside Safari) and anything over the request size limit. Uses the
 * browser's own decoder, so HEIC works where the browser can read it (Safari).
 */
async function prepareImage(file: File): Promise<File> {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
  if (!isHeic && file.size <= MAX_IMAGE_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('הדפדפן לא מצליח לקרוא את התמונה — המר ל-JPEG ונסה שוב');
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encoded = Promise.withResolvers<Blob | null>();
  canvas.toBlob(encoded.resolve, 'image/jpeg', 0.85);
  const blob = await encoded.promise;
  if (!blob) throw new Error('המרת התמונה נכשלה');
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** Upload one image to an existing lesson. Throws on failure. */
export async function uploadImageFile(file: File, options: { lessonId: string; sortOrder: number }): Promise<void> {
  const prepared = await prepareImage(file);
  const form = new FormData();
  form.append('file', prepared);
  form.append('lessonId', options.lessonId);
  form.append('sortOrder', String(options.sortOrder));
  const res = await fetch('/api/upload/image', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await errorMessage(res, 'Image upload failed'));
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export interface FileUploadProgress {
  fileName: string;
  progress: number;
  status: UploadStatus;
  error?: string;
}

export interface FileWithMeta {
  file: File;
  metadata: AudioMetadata;
  /** If true, file will be transcoded to Opus before upload */
  transcodeEnabled?: boolean;
  audioType?: string | null;
}

export interface UploadMultipleResult {
  uploaded: number;
  failed: Array<{ fileName: string; error: string }>;
}

/** Sequential multi-file audio upload with per-file progress, for the edit and share pages. */
export function useUpload() {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileProgresses, setFileProgresses] = useState<FileUploadProgress[]>([]);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setError(null);
    setFileProgresses([]);
  }, []);

  const uploadMultiple = useCallback(async (
    files: FileWithMeta[],
    lessonId: string,
    startSortOrder = 0,
  ): Promise<UploadMultipleResult> => {
    setStatus('uploading');
    setProgress(0);
    setError(null);
    setFileProgresses(files.map((f) => ({ fileName: f.file.name, progress: 0, status: 'idle' })));

    const update = (index: number, patch: Partial<FileUploadProgress>) =>
      setFileProgresses((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));

    const failed: UploadMultipleResult['failed'] = [];
    for (let i = 0; i < files.length; i++) {
      const { file, metadata, transcodeEnabled, audioType } = files[i];
      update(i, { status: transcodeEnabled ? 'processing' : 'uploading' });
      try {
        await uploadAudioFile(file, {
          lessonId,
          sortOrder: startSortOrder + i,
          audioType,
          duration: metadata.duration,
          transcode: transcodeEnabled,
          onProgress: (pct) => {
            update(i, { progress: pct });
            setProgress(Math.round((i * 100 + pct) / files.length));
          },
        });
        update(i, { progress: 100, status: 'complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        update(i, { status: 'error', error: message });
        failed.push({ fileName: file.name, error: message });
      }
    }

    const uploaded = files.length - failed.length;
    setProgress(100);
    if (failed.length === 0) {
      setStatus('complete');
    } else {
      setStatus('error');
      setError(failed.map((f) => `${f.fileName}: ${f.error}`).join('\n'));
    }
    return { uploaded, failed };
  }, []);

  return { status, progress, error, fileProgresses, uploadMultiple, reset };
}
