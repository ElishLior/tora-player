import { normalizeAudioUrl } from '@/lib/audio-url';
import { getOfflineKey, type OfflineLessonMeta } from '@/lib/offline-storage';
import type { AudioTrack } from '@/stores/audio-store';
import type { LessonAudio, LessonWithRelations } from '@/types/database';

/*
 * A lesson's playable audio files and the player tracks made from them.
 * Every surface that starts a lesson builds its queue with getLessonTracks, so
 * all parts play in order and each track knows its part.
 */

export interface LessonAudioAsset {
  audioFileId?: string;
  fileKey?: string;
  audioUrl: string;
  title: string;
  originalName?: string | null;
  audioType?: string | null;
  duration: number;
  fileSize?: number;
  sortOrder: number;
  partIndex: number;
  partCount: number;
  offlineKey: string;
}

export function getSortedAudioFiles(lesson: LessonWithRelations): LessonAudio[] {
  return [...(lesson.audio_files || [])].sort((a, b) => {
    const order = a.sort_order - b.sort_order;
    if (order !== 0) return order;
    return a.id.localeCompare(b.id);
  });
}

export function getLessonAudioAssets(lesson: LessonWithRelations): LessonAudioAsset[] {
  const sortedAudioFiles = getSortedAudioFiles(lesson);
  if (sortedAudioFiles.length > 0) {
    return sortedAudioFiles.map((audio, index) => {
      const audioUrl = normalizeAudioUrl(audio.audio_url) || audio.audio_url;
      return {
        audioFileId: audio.id,
        fileKey: audio.file_key,
        audioUrl,
        title: audio.original_name || `חלק ${index + 1}`,
        originalName: audio.original_name,
        audioType: audio.audio_type,
        duration: audio.duration || 0,
        fileSize: audio.file_size,
        partIndex: index,
        partCount: sortedAudioFiles.length,
        sortOrder: audio.sort_order ?? index,
        offlineKey: getOfflineKey(lesson.id, {
          audioFileId: audio.id,
          fileKey: audio.file_key,
          audioUrl,
        }),
      };
    });
  }

  const audioUrl = normalizeAudioUrl(lesson.audio_url) || lesson.audio_url;
  if (!audioUrl) return [];

  return [
    {
      audioUrl,
      title: lesson.hebrew_title || lesson.title,
      duration: lesson.duration,
      fileSize: lesson.file_size,
      sortOrder: 0,
      partIndex: 0,
      partCount: 1,
      offlineKey: getOfflineKey(lesson.id, { audioUrl }),
    },
  ];
}

function createLessonTrack(
  lesson: LessonWithRelations,
  asset: LessonAudioAsset,
  partIndex: number,
  partCount: number,
): AudioTrack {
  return {
    id: lesson.id,
    lessonId: lesson.id,
    audioFileId: asset.audioFileId,
    partIndex,
    partCount,
    fileKey: asset.fileKey,
    offlineKey: asset.offlineKey,
    title: lesson.title,
    hebrewTitle: lesson.hebrew_title || lesson.title,
    audioUrl: asset.audioUrl,
    audioUrlFallback: normalizeAudioUrl(lesson.audio_url_fallback) || undefined,
    duration: asset.duration || (partCount === 1 ? lesson.duration : 0),
    seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
    date: lesson.date,
    description: lesson.description || lesson.summary || undefined,
    originalName: asset.originalName || asset.title,
  };
}

/** One track per part, in play order. Empty when the lesson has no audio. */
export function getLessonTracks(lesson: LessonWithRelations): AudioTrack[] {
  const assets = getLessonAudioAssets(lesson);
  return assets.map((asset, index) => createLessonTrack(lesson, asset, index, assets.length));
}

/** The tracks of a lesson saved on this device (played from IndexedDB). */
export function getOfflineLessonTracks(lesson: OfflineLessonMeta): AudioTrack[] {
  const files = [...lesson.audioFiles].sort((a, b) => a.sortOrder - b.sortOrder);
  return files.map((file) => ({
    id: lesson.lessonId,
    lessonId: lesson.lessonId,
    audioFileId: file.audioFileId,
    partIndex: file.partIndex ?? (file.audioFileId ? undefined : 0),
    partCount: file.partCount ?? (file.audioFileId ? undefined : 1),
    fileKey: file.fileKey,
    offlineKey: file.offlineKey,
    title: lesson.title,
    hebrewTitle: lesson.hebrewTitle || lesson.title,
    audioUrl: file.audioUrl,
    duration: file.duration || (file.partCount === 1 || !file.audioFileId ? lesson.duration : 0),
    seriesName: lesson.seriesName,
    date: lesson.date,
    originalName: file.originalName || file.title,
  }));
}

/**
 * Whether a saved moment (bookmark, note) belongs to this part. Moments saved
 * without an audio file id point into the main (first) part.
 */
export function isMomentInPart(
  audioFileId: string | null | undefined,
  part: { audioFileId?: string; partIndex?: number },
): boolean {
  return audioFileId ? audioFileId === part.audioFileId : (part.partIndex ?? 0) === 0;
}

/**
 * Locale-less path that opens a lesson and plays from `position` seconds of
 * the given audio file (the main file when none). Read by the lesson page.
 */
export function lessonMomentPath(lessonId: string, position: number, audioFileId?: string | null): string {
  const file = audioFileId ? `&file=${encodeURIComponent(audioFileId)}` : '';
  return `/lessons/${lessonId}?t=${Math.floor(position)}${file}`;
}
