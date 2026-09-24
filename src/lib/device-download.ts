'use client';

import type { MouseEvent } from 'react';
import { getOfflineAudioBlob } from '@/lib/offline-storage';

interface DeviceDownloadFile {
  lessonId: string;
  offlineKey?: string;
  audioUrl: string;
  /** Final filename, e.g. from buildAudioDownloadFilename. */
  filename: string;
  /** Whether this file is already saved offline (its Blob is in IndexedDB). */
  savedOffline: boolean;
}

/**
 * Click handler for "download file to device" links whose href is
 * getAudioDownloadUrl(...).
 *
 * Desktop, Android and iOS Safari tabs follow the link natively (the route
 * redirects to an R2 attachment). An iOS home-screen app can't save
 * attachment downloads, so there:
 * - a file already saved offline goes to the share sheet ("Save to Files");
 * - otherwise the link opens in a Safari view, which can download/share it.
 */
export function handleDeviceDownloadClick(
  event: MouseEvent<HTMLAnchorElement>,
  file: DeviceDownloadFile,
): void {
  if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return;

  event.preventDefault();
  const url = event.currentTarget.href;

  if (!file.savedOffline) {
    window.open(url, '_blank', 'noopener');
    return;
  }

  void (async () => {
    const blob = await getOfflineAudioBlob(file.lessonId, file.audioUrl, file.offlineKey);
    const shareFile = blob ? new File([blob], file.filename, { type: blob.type || 'audio/mpeg' }) : null;

    if (shareFile && navigator.canShare?.({ files: [shareFile] })) {
      try {
        await navigator.share({ files: [shareFile], title: file.filename });
        return;
      } catch (error) {
        // The user closed the share sheet.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Share failed, opening the download link instead:', error);
      }
    }
    window.open(url, '_blank', 'noopener');
  })();
}
