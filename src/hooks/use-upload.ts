'use client';

import { useState, useCallback } from 'react';
import type { AudioMetadata } from '@/lib/audio-utils';

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
    // 1. Get presigned URL from our API
    const presignRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId,
        fileName: file.name,
        contentType: file.type || 'audio/mpeg',
        fileSize: file.size,
        sortOrder,
      }),
    });

    if (!presignRes.ok) {
      throw new Error('Failed to get upload URL');
    }

    const { uploadUrl, publicUrl } = await presignRes.json();

    // 2. Upload directly to R2 using presigned URL with progress tracking
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress?.(pct);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg');
      xhr.send(file);
    });

    return publicUrl;
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
