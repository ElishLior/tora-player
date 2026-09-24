import { buildAudioDownloadFilename, getAudioDownloadUrl } from '@/lib/audio-download';
import {
  getOfflineKey,
  type OfflineAudioDownloadInput,
  type OfflineLessonInput,
  type OfflineLessonMeta,
} from '@/lib/offline-storage';
import { normalizeAudioUrl } from '@/lib/audio-url';
import type { AudioTrack } from '@/stores/audio-store';

export function getTrackLessonId(track: AudioTrack): string {
  return track.lessonId || track.id;
}

export function getTrackOfflineKey(track: AudioTrack): string {
  return getOfflineKey(getTrackLessonId(track), {
    offlineKey: track.offlineKey,
    audioFileId: track.audioFileId,
    fileKey: track.fileKey,
    audioUrl: track.audioUrl,
  });
}

export function getTrackDownloadFilename(track: AudioTrack): string {
  return buildAudioDownloadFilename(track.originalName || track.hebrewTitle || track.title || 'lesson', track.audioUrl);
}

export function getTrackDownloadUrl(track: AudioTrack): string {
  return getAudioDownloadUrl(track.audioUrl, getTrackDownloadFilename(track));
}

export function getTrackOfflineDownloadInput(track: AudioTrack): OfflineAudioDownloadInput {
  return {
    audioFileId: track.audioFileId,
    fileKey: track.fileKey,
    audioUrl: track.audioUrl,
    title: track.originalName || track.hebrewTitle || track.title,
    originalName: track.originalName,
    duration: track.duration,
    sortOrder: 0,
  };
}

export function getTrackOfflineLessonInput(track: AudioTrack): OfflineLessonInput {
  return {
    lessonId: getTrackLessonId(track),
    title: track.title,
    hebrewTitle: track.hebrewTitle || track.title,
    duration: track.duration,
    seriesName: track.seriesName,
    date: track.date,
  };
}

export function isTrackDownloadedInLesson(track: AudioTrack, downloadedLesson: OfflineLessonMeta | null): boolean {
  if (!downloadedLesson || downloadedLesson.lessonId !== getTrackLessonId(track)) {
    return false;
  }

  const trackOfflineKey = getTrackOfflineKey(track);
  const normalizedTrackUrl = normalizeAudioUrl(track.audioUrl) || track.audioUrl;

  return downloadedLesson.audioFiles.some((file) => {
    const normalizedFileUrl = normalizeAudioUrl(file.audioUrl) || file.audioUrl;
    return (
      file.offlineKey === trackOfflineKey ||
      (track.audioFileId && file.audioFileId === track.audioFileId) ||
      normalizedFileUrl === normalizedTrackUrl ||
      file.audioUrl === track.audioUrl
    );
  });
}

/** The "back" control always rewinds this much; "forward" always advances SKIP_FORWARD_SECONDS. */
export const SKIP_BACK_SECONDS = 15;
export const SKIP_FORWARD_SECONDS = 30;
