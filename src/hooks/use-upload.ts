'use client';

import { useState, useCallback } from 'react';
import type { AudioMetadata } from '@/lib/audio-utils';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

interface UseUploadReturn {
  status: UploadStatus;
  progress: number;
  error: string | null;
  upload: (file: File, lessonId: string, metadata: AudioMetadata) => Promise<string | null>;
  reset: () => void;
}

export function useUpload(): UseUploadReturn {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setError(null);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const upload = useCallback(async (file: File, lessonId: string, _metadata: AudioMetadata): Promise<string | null> => {
    try {
      setStatus('uploading');
      setProgress(0);
      setError(null);

      // 1. Get presigned URL from our API
      const presignRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          fileName: file.name,
          contentType: file.type || 'audio/mpeg',
          fileSize: file.size,
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
            setProgress(Math.round((e.loaded / e.total) * 100));
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

      setStatus('processing');

      // For now, skip transcoding - the original file is directly usable
      // In the future, we'd trigger a Cloudflare Worker here

      setStatus('complete');
      setProgress(100);

      return publicUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setStatus('error');
      return null;
    }
  }, []);

  return { status, progress, error, upload, reset };
}
