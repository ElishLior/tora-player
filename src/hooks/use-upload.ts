'use client';

import { useState, useCallback } from 'react';
import type { AudioMetadata } from '@/lib/audio-utils';

function guessContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'ogg': return 'audio/ogg';
    case 'opus': return 'audio/opus';
    case 'webm': return 'audio/webm';
    case 'wav': return 'audio/wav';
    case 'flac': return 'audio/flac';
    default: return 'audio/mpeg';
  }
}

/** Generate a simple UUID v4 */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Chunk size: 3.5 MB (well under Vercel's 4.5 MB body limit)
const CHUNK_SIZE = 3.5 * 1024 * 1024;

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export interface FileUploadProgress {
  fileName: string;
  progress: number;
  status: UploadStatus;
  error?: string;
}

interface UseUploadReturn {
  status: UploadStatus;
  progress: number;
  error: string | null;
  fileProgresses: FileUploadProgress[];
  upload: (file: File, lessonId: string, metadata: AudioMetadata, sortOrder?: number) => Promise<string | null>;
  uploadMultiple: (files: FileWithMeta[], lessonId: string) => Promise<string[]>;
  reset: () => void;
}

export interface FileWithMeta {
  file: File;
  metadata: AudioMetadata;
}

export function useUpload(): UseUploadReturn {
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

  const uploadSingleFile = useCallback(async (
    file: File,
    lessonId: string,
    _metadata: AudioMetadata,
    sortOrder: number = 0,
    onProgress?: (pct: number) => void,
  ): Promise<string | null> => {
    const contentType = file.type || guessContentType(file.name);
    const uploadId = uuid();
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);

    // Step 1: Upload file in chunks
    for (let partNumber = 0; partNumber < totalParts; partNumber++) {
      const start = partNumber * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append('uploadId', uploadId);
      formData.append('partNumber', String(partNumber));
      formData.append('chunk', chunk, `chunk_${partNumber}`);

      // Use XHR for progress tracking on each chunk
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            // Overall progress = completed chunks + current chunk progress
            const chunkProgress = e.loaded / e.total;
            const overallPct = Math.round(((partNumber + chunkProgress) / totalParts) * 90); // 90% for uploads, 10% for assembly
            onProgress?.(overallPct);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let msg = `Chunk upload failed (${xhr.status})`;
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.error) msg = data.error;
            } catch { /* ignore */ }
            reject(new Error(msg));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed — network error')));
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

        xhr.open('POST', '/api/upload/chunk');
        xhr.timeout = 120000; // 2 min per chunk
        xhr.send(formData);
      });
    }

    // Step 2: Assemble chunks and upload to R2
    onProgress?.(92);

    const completeRes = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        totalParts,
        lessonId,
        fileName: file.name,
        contentType,
        fileSize: file.size,
        sortOrder,
      }),
    });

    if (!completeRes.ok) {
      const data = await completeRes.json().catch(() => ({}));
      throw new Error(data.error || `Failed to complete upload (${completeRes.status})`);
    }

    const result = await completeRes.json();
    onProgress?.(100);
    return result.publicUrl;
  }, []);

  // Upload a single file (backward compatible)
  const upload = useCallback(async (
    file: File,
    lessonId: string,
    metadata: AudioMetadata,
    sortOrder: number = 0,
  ): Promise<string | null> => {
    try {
      setStatus('uploading');
      setProgress(0);
      setError(null);

      const url = await uploadSingleFile(file, lessonId, metadata, sortOrder, (pct) => {
        setProgress(pct);
      });

      setStatus('complete');
      setProgress(100);
      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setStatus('error');
      return null;
    }
  }, [uploadSingleFile]);

  // Upload multiple files sequentially with per-file progress
  const uploadMultiple = useCallback(async (
    files: FileWithMeta[],
    lessonId: string,
  ): Promise<string[]> => {
    setStatus('uploading');
    setProgress(0);
    setError(null);

    const initialProgresses: FileUploadProgress[] = files.map((f) => ({
      fileName: f.file.name,
      progress: 0,
      status: 'idle' as UploadStatus,
    }));
    setFileProgresses(initialProgresses);

    const urls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const { file, metadata } = files[i];

      setFileProgresses((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: 'uploading' } : p
        )
      );

      try {
        const url = await uploadSingleFile(file, lessonId, metadata, i, (pct) => {
          setFileProgresses((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, progress: pct } : p
            )
          );
          const overall = Math.round(((i * 100 + pct) / files.length));
          setProgress(overall);
        });

        setFileProgresses((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, progress: 100, status: 'complete' } : p
          )
        );

        if (url) urls.push(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setFileProgresses((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'error', error: message } : p
          )
        );
      }
    }

    if (urls.length > 0) {
      setStatus('complete');
      setProgress(100);
    } else {
      setStatus('error');
      setError('All file uploads failed');
    }

    return urls;
  }, [uploadSingleFile]);

  return { status, progress, error, fileProgresses, upload, uploadMultiple, reset };
}
